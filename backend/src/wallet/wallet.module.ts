import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { WalletController } from './wallet.controller';

@Module({
  imports: [GatewayModule],
  controllers: [WalletController]
})
export class WalletModule {}
