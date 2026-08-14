import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { GatewayService } from '../gateway/gateway.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly gateway: GatewayService) {}

  @Get()
  balance(@CurrentUser() user: { id: string }) {
    return this.gateway.getWallet(user.id);
  }

  @Get('transactions')
  transactions(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('limit') limit = '20'
  ) {
    return this.gateway.getWalletTransactions(user.id, { status, type, limit });
  }
}
