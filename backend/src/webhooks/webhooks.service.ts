import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { WebhookEvent } from '../common/entities/webhook-event.entity';
import { CheckoutService } from '../checkout/checkout.service';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookEvent)
    private readonly events: Repository<WebhookEvent>,
    private readonly config: ConfigService,
    private readonly checkoutService: CheckoutService,
    private readonly withdrawalsService: WithdrawalsService
  ) {}

  async handle(eventType: string, payload: Record<string, unknown>, signature?: string) {
    this.validateSignature(payload, signature);

    const externalReference = this.readString(payload, ['externalReference', 'external_reference', 'reference']);
    const gatewayId = this.readString(payload, ['id', 'paymentId', 'withdrawalId']);
    const status = this.readString(payload, ['status']) || 'PENDING';
    const eventId = this.readString(payload, ['eventId', 'event_id', 'webhookId']);
    const eventKey = createHash('sha256')
      .update(`${eventType}:${eventId || gatewayId || externalReference || ''}:${status}:${JSON.stringify(payload)}`)
      .digest('hex');

    const existing = await this.events.findOne({ where: { eventKey } });
    if (existing) {
      return { received: true, duplicate: true, eventId: existing.id };
    }

    const event = await this.events.save(
      this.events.create({ eventKey, eventType, externalReference, gatewayId, payload, processed: false })
    );

    if (eventType.startsWith('PAYMENT') && externalReference) {
      await this.checkoutService.updateByExternalReference(externalReference, status);
    }

    if (eventType === 'WITHDRAWAL' && gatewayId) {
      await this.withdrawalsService.updateFromWebhook(gatewayId, status);
    }

    event.processed = true;
    await this.events.save(event);

    return { received: true, eventId: event.id };
  }

  private validateSignature(payload: Record<string, unknown>, signature?: string) {
    const secret = this.config.get<string>('WEBHOOK_SECRET');
    if (!secret) {
      return;
    }
    if (!signature) {
      throw new BadRequestException('Assinatura do webhook ausente');
    }

    const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signature);

    if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
      throw new BadRequestException('Assinatura do webhook inválida');
    }
  }

  private readString(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string') {
        return value;
      }
    }
    return undefined;
  }
}
