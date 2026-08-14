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
    const gatewayPayload = {
      amount: dto.amountCents,
      description: dto.description,
      externalReference,
      payerDocument: dto.payerDocument,
      installments: dto.installments,
      feePercent: dto.feePercent,
      brand: dto.brand
    };

    const payment =
      dto.method === 'PIX'
        ? await this.gateway.createPixPayment(userId, gatewayPayload)
        : await this.gateway.createCardPayment(userId, gatewayPayload);

    const gatewayPaymentId = payment.id || payment.paymentId || payment.txid || null;
    const checkout = this.checkoutLinks.create({
      userId,
      externalReference,
      description: dto.description,
      amountCents: dto.amountCents,
      method: dto.method,
      installments: dto.installments,
      feePercent: dto.feePercent?.toString() ?? null,
      gatewayPaymentId: gatewayPaymentId ? String(gatewayPaymentId) : null,
      qrCodeBase64: payment.qrCodeBase64 || payment.qrcodeBase64 || null,
      emv: payment.emv || payment.copyPaste || null
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
