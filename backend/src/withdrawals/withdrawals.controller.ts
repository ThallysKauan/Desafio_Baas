import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';

@ApiTags('withdrawals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateWithdrawalDto) {
    return this.withdrawalsService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.withdrawalsService.list(user.id);
  }

  @Get(':id/refresh')
  refresh(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.withdrawalsService.refresh(user.id, id);
  }

  @Get(':id')
  getStatus(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.withdrawalsService.refresh(user.id, id);
  }
}
