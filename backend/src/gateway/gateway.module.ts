import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayAccount } from '../common/entities/gateway-account.entity';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([GatewayAccount])],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService]
})
export class GatewayModule {}
