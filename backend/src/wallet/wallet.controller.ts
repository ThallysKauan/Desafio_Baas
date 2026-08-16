import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  balance(@CurrentUser() user: { id: string }) {
    return this.wallet.getBalance(user.id);
  }

  @Get('transactions')
  transactions(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('limit') limit = '20'
  ) {
    return this.wallet.getTransactions(user.id, { status, type, limit });
  }
}
