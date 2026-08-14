import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from '../common/entities/webhook-event.entity';
import { CheckoutModule } from '../checkout/checkout.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent]), CheckoutModule, WithdrawalsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService]
})
export class WebhooksModule {}
