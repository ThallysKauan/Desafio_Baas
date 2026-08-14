import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { CheckoutLink } from '../common/entities/checkout-link.entity';
import { GatewayService } from '../gateway/gateway.service';
import { CreateCheckoutLinkDto } from './dto/create-checkout-link.dto';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(CheckoutLink)
    private readonly checkoutLinks: Repository<CheckoutLink>,
    private readonly gateway: GatewayService
  ) {}

  async create(userId: string, dto: CreateCheckoutLinkDto) {
    const externalReference = `baas_${randomUUID()}`;
    const commonPayload = {
      amount: dto.amountCents,
      description: dto.description,
      externalReference
    };

    const pixPayload = {
      ...commonPayload,
      payerDocument: dto.payerDocument,
    };

    const installments = Number(dto.installments) || 1;
    const brand = (dto.brand || 'VISA').toUpperCase();
    const fees = dto.method === 'CARD' ? await this.gateway.getFees(brand) : null;
    const feePercent = dto.method === 'CARD'
      ? this.findFeePercent(fees, brand, installments)
      : 0;

    const cardPayload = {
      ...commonPayload,
      installments,
      feePercent,
      cardNumber: dto.cardNumber,
      cardHolder: dto.cardHolder,
      expiryMonth: dto.expiryMonth,
      expiryYear: dto.expiryYear,
      cvv: dto.cvv
    };

    const payment =
      dto.method === 'PIX'
        ? await this.gateway.createPixPayment(userId, pixPayload)
        : await this.gateway.createCardPayment(userId, cardPayload);

    const gatewayPaymentId = payment.id || payment.paymentId || payment.txid || null;
    const qrCodeBase64 =
      payment.qrCodeBase64 ||
      payment.qrcodeBase64 ||
      payment.qrCode ||
      payment.qrcode ||
      payment.qr_code ||
      null;
    const emv =
      payment.emv ||
      payment.copyPaste ||
      payment.copy_paste ||
      payment.pixCopyPaste ||
      payment.pixCopiaECola ||
      null;
    const checkout = this.checkoutLinks.create({
      userId,
      externalReference,
      description: dto.description,
      amountCents: dto.amountCents,
      method: dto.method,
      installments: dto.method === 'CARD' ? installments : null,
      feePercent: dto.method === 'CARD' ? feePercent.toString() : null,
      gatewayPaymentId: gatewayPaymentId ? String(gatewayPaymentId) : null,
      qrCodeBase64: qrCodeBase64 ? String(qrCodeBase64) : null,
      emv: emv ? String(emv) : null
    });

    await this.checkoutLinks.save(checkout);

    return { checkout, payment };
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

  async updateByExternalReference(externalReference: string, status: string) {
    const checkout = await this.checkoutLinks.findOne({ where: { externalReference } });
    if (!checkout) {
      return null;
    }
    checkout.status = status as never;
    return this.checkoutLinks.save(checkout);
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
