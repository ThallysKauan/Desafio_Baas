import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutLink } from '../common/entities/checkout-link.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [TypeOrmModule.forFeature([CheckoutLink]), NotificationsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService]
})
export class CheckoutModule {}
