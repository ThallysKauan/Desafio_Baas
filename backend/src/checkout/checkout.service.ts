import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { CheckoutLink } from '../common/entities/checkout-link.entity';
import { GatewayService } from '../gateway/gateway.service';
import { CreateCheckoutLinkDto } from './dto/create-checkout-link.dto';
import { PayCheckoutDto } from './dto/pay-checkout.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(CheckoutLink)
    private readonly checkoutLinks: Repository<CheckoutLink>,
    private readonly gateway: GatewayService,
    private readonly notifications: NotificationsService
  ) {}

  async create(userId: string, dto: CreateCheckoutLinkDto) {
    const externalReference = this.createExternalReference();
    const checkout = this.checkoutLinks.create({
      userId,
      externalReference,
      description: dto.description,
      amountCents: dto.amountCents,
      customerEmail: null,
      payerDocument: null,
      method: dto.method,
      status: 'OPEN',
      installments: dto.installments || null,
      feePercent: null,
      gatewayPaymentId: null,
      qrCodeBase64: null,
      emv: null,
      failureReason: null,
      attempts: 0,
      lastAttemptAt: null
    });
    await this.checkoutLinks.save(checkout);
    return checkout;
  }

  async pay(id: string, dto: PayCheckoutDto) {
    const checkout = await this.findPublic(id);
    if (checkout.status === 'APPROVED') {
      throw new ConflictException('Este checkout já foi pago');
    }
    if (['EXPIRED', 'CANCELLED'].includes(checkout.status)) {
      throw new ConflictException('Este link não aceita novas tentativas');
    }
    if (checkout.method !== 'BOTH' && checkout.method !== dto.method) {
      throw new BadRequestException('Método de pagamento não permitido neste link');
    }
    if (!this.isValidCpfOrCnpj(dto.payerDocument)) {
      throw new BadRequestException('CPF ou CNPJ inválido');
    }

    const externalReference = this.createExternalReference(checkout.id);
    const commonPayload = { amount: checkout.amountCents, description: checkout.description, externalReference };
    checkout.externalReference = externalReference;
    checkout.attempts += 1;
    checkout.lastAttemptAt = new Date();
    checkout.failureReason = null;
    checkout.customerEmail = dto.email;
    checkout.payerDocument = dto.payerDocument;
    checkout.qrCodeBase64 = null;
    checkout.emv = null;

    try {
      let payment: Record<string, any>;
      if (dto.method === 'PIX') {
        if (!dto.payerDocument) throw new BadRequestException('Informe o CPF ou CNPJ do pagador');
        if (dto.payerDocument === '99999999999') {
          throw new BadRequestException('Chave Pix do cliente com restrição de pagamento (Simulação de Teste)');
        }
        if (dto.payerDocument === '00000000000') {
          throw new BadRequestException('CPF com pendência cadastral na Receita Federal (Simulação de Teste)');
        }
        payment = await this.gateway.createPixPayment(checkout.userId, { ...commonPayload, document: dto.payerDocument });
      } else {
        this.validateCard(dto);
        const cardDigits = (dto.cardNumber || '').replace(/\D/g, '');
        if (cardDigits === '4000000000000002') {
          throw new BadRequestException('Cartão recusado pelo banco emissor (Simulação de Teste)');
        }
        if (cardDigits === '4000000000000003') {
          throw new BadRequestException('Saldo insuficiente no cartão de crédito (Simulação de Teste)');
        }
        if (cardDigits === '4000000000000004') {
          throw new BadRequestException('Transação bloqueada por suspeita de fraude (Simulação de Teste)');
        }
        if (cardDigits === '4000000000000005') {
          throw new BadRequestException('Cartão de crédito expirado ou inválido (Simulação de Teste)');
        }

        const installments = Number(dto.installments) || 1;
        const brand = (dto.brand || 'VISA').toUpperCase();
        const fees = await this.gateway.getFees(brand);
        const feePercent = this.findFeePercent(fees, brand, installments);
        checkout.installments = installments;
        checkout.feePercent = feePercent.toString();
        payment = await this.gateway.createCardPayment(checkout.userId, {
          ...commonPayload,
          installments,
          feePercent,
          cardNumber: dto.cardNumber,
          cardHolder: dto.cardHolder,
          expiryMonth: dto.expiryMonth,
          expiryYear: dto.expiryYear,
          cvv: dto.cvv
        });
      }

      const paymentData = payment.payment || payment.data || payment;
      checkout.gatewayPaymentId = String(paymentData.id || paymentData.paymentId || paymentData.txid || '') || null;
      const pixInfo = this.extractPixFields(paymentData);
      checkout.qrCodeBase64 = pixInfo.qrCodeBase64;
      checkout.emv = pixInfo.emv;
      checkout.status = this.normalizeStatus(paymentData.status, 'PENDING', dto.method === 'PIX');
      checkout.failureReason = checkout.status === 'DENIED'
        ? String(paymentData.reason || paymentData.message || paymentData.declineReason || 'Pagamento não autorizado')
        : null;
      await this.checkoutLinks.save(checkout);
      await this.notifications.sendPaymentResult(checkout).catch(() => undefined);
      return { checkout, payment };
    } catch (error) {
      checkout.status = 'DENIED';
      checkout.failureReason = this.readErrorMessage(error);
      await this.checkoutLinks.save(checkout);
      await this.notifications.sendPaymentResult(checkout).catch(() => undefined);
      throw error;
    }
  }

  list(userId: string, status?: string) {
    return this.checkoutLinks.find({
      where: status ? { userId, status: status as never } : { userId },
      order: { createdAt: 'DESC' }
    });
  }

  async quoteFee(brand: string, installments: number) {
    const normalizedBrand = brand.toUpperCase();
    const fees = await this.gateway.getFees(normalizedBrand);
    return {
      brand: normalizedBrand,
      installments,
      feePercent: this.findFeePercent(fees, normalizedBrand, installments)
    };
  }

  async findPublic(id: string) {
    const checkout = await this.checkoutLinks.findOne({ where: { id } });
    if (!checkout) {
      throw new NotFoundException('Checkout não encontrado');
    }
    return checkout;
  }

  async updateByExternalReference(externalReference: string, status: string, failureReason?: string) {
    const checkout = await this.checkoutLinks.findOne({ where: { externalReference } });
    if (!checkout) {
      return null;
    }
    checkout.status = this.normalizeStatus(status, checkout.status);
    if (checkout.status === 'APPROVED') checkout.failureReason = null;
    if (checkout.status === 'DENIED' && failureReason) checkout.failureReason = failureReason;
    return this.checkoutLinks.save(checkout);
  }

  private validateCard(dto: PayCheckoutDto) {
    if (!dto.cardNumber || !dto.cardHolder || !dto.expiryMonth || !dto.expiryYear || !dto.cvv) {
      throw new BadRequestException('Preencha todos os dados do cartão');
    }
  }

  private createExternalReference(checkoutId?: string) {
    const randomPart = randomUUID().replace(/-/g, '').slice(0, 20);
    const checkoutPart = checkoutId ? `${checkoutId.replace(/-/g, '').slice(0, 12)}_` : '';
    return `baas_${checkoutPart}${randomPart}`;
  }

  private isValidCpfOrCnpj(value: string) {
    const digits = value.replace(/\D/g, '');
    if (/^(\d)\1+$/.test(digits)) return false;
    if (digits.length === 11) return this.isValidCpf(digits);
    if (digits.length === 14) return this.isValidCnpj(digits);
    return false;
  }

  private isValidCpf(digits: string) {
    const calculateDigit = (length: number) => {
      const sum = digits
        .slice(0, length)
        .split('')
        .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };
    return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
  }

  private isValidCnpj(digits: string) {
    const calculateDigit = (weights: number[]) => {
      const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return calculateDigit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[12])
      && calculateDigit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[13]);
  }

  private readPaymentField(payment: Record<string, any>, keys: string[]): string | null {
    if (!payment || typeof payment !== 'object') return null;
    for (const key of keys) {
      if (payment[key] && typeof payment[key] === 'string') return payment[key];
    }
    for (const value of Object.values(payment)) {
      if (value && typeof value === 'object') {
        const found = this.readPaymentField(value as Record<string, any>, keys);
        if (found) return found;
      }
    }
    return null;
  }

  private extractPixFields(paymentData: Record<string, any>) {
    const strings: string[] = [];
    const visit = (val: any) => {
      if (!val) return;
      if (typeof val === 'string') {
        strings.push(val);
      } else if (typeof val === 'object') {
        Object.values(val).forEach(visit);
      }
    };
    visit(paymentData);

    let emv = strings.find((s) => s.startsWith('000201')) || null;
    let qrCodeBase64 = strings.find((s) =>
      s.startsWith('data:image') ||
      s.startsWith('http://') ||
      s.startsWith('https://') ||
      (s.startsWith('iVBORw0KG') && s.length > 100)
    ) || null;

    if (!emv) {
      emv = this.readPaymentField(paymentData, ['emv', 'copyPaste', 'copy_paste', 'pixCopyPaste', 'pixCopiaECola', 'brcode', 'code', 'payload']);
    }
    if (!qrCodeBase64) {
      const candidate = this.readPaymentField(paymentData, ['qrCodeBase64', 'qrcodeBase64', 'qrCodeUrl', 'qr_code_url', 'base64', 'image']);
      if (candidate && !candidate.startsWith('000201')) {
        qrCodeBase64 = candidate;
      }
    }

    return { emv, qrCodeBase64 };
  }

  private normalizeStatus(status: unknown, fallback: CheckoutLink['status'], isPix = false): CheckoutLink['status'] {
    const value = String(status || fallback).toUpperCase();
    if (isPix && (value === 'SUCCESS' || value === 'CREATED' || value === 'ACTIVE' || value === 'OK')) {
      return 'PENDING';
    }
    const aliases: Record<string, CheckoutLink['status']> = {
      PAID: 'APPROVED',
      CONFIRMED: 'APPROVED',
      SUCCESS: isPix ? 'PENDING' : 'APPROVED',
      FAILED: 'DENIED',
      DECLINED: 'DENIED',
      REJECTED: 'DENIED',
      WAITING: 'PENDING'
    };
    return aliases[value] || (['OPEN', 'PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'].includes(value) ? value as CheckoutLink['status'] : fallback);
  }

  private readErrorMessage(error: unknown) {
    if (error instanceof BadGatewayException || error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: string | string[] }).message;
        return Array.isArray(message) ? message.join(', ') : message || 'Pagamento recusado';
      }
    }
    return error instanceof Error ? error.message : 'Pagamento recusado';
  }

  private findFeePercent(data: unknown, brand: string, installments: number): number {
    const candidates: Record<string, unknown>[] = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      const item = value as Record<string, unknown>;
      candidates.push(item);
      Object.values(item).forEach(visit);
    };
    visit(data);

    const match = candidates.find((item) => {
      const itemBrand = String(item.brand ?? item.bandeira ?? item.cardBrand ?? '').toUpperCase();
      const itemInstallments = Number(item.installments ?? item.parcelas ?? item.installment ?? item.number);
      return (!itemBrand || itemBrand === brand) && itemInstallments === installments;
    });
    const value = match?.feePercent ?? match?.percent ?? match?.fee ?? match?.taxa ?? match?.percentage;
    const fee = Number(value);
    if (!Number.isFinite(fee) || fee <= 0) {
      throw new BadGatewayException(`Taxa não encontrada para ${brand} em ${installments}x`);
    }
    return fee;
  }
}
