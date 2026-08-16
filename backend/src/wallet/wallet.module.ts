import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutLink } from '../common/entities/checkout-link.entity';
import { Withdrawal } from '../common/entities/withdrawal.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [TypeOrmModule.forFeature([CheckoutLink, Withdrawal])],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService]
})
export class WalletModule {}
