import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutLink } from '../common/entities/checkout-link.entity';
import { Withdrawal } from '../common/entities/withdrawal.entity';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';

@Module({
  imports: [TypeOrmModule.forFeature([CheckoutLink, Withdrawal])],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService],
  exports: [WithdrawalsService]
})
export class WithdrawalsModule {}
