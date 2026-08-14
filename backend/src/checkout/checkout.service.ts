import { Injectable, NotFoundException } from '@nestjs/common';
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

    const cardPayload = {
      ...commonPayload,
      installments: dto.installments,
      feePercent: Math.max(Number(dto.feePercent) || 0.01, 0.01),
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
      installments: dto.installments,
      feePercent: dto.feePercent?.toString() ?? null,
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
}
