import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Withdrawal } from '../common/entities/withdrawal.entity';
import { GatewayService } from '../gateway/gateway.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawalsService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawals: Repository<Withdrawal>,
    private readonly gateway: GatewayService
  ) {}

  async create(userId: string, dto: CreateWithdrawalDto) {
    const response = await this.gateway.createWithdrawal(userId, {
      amount: dto.amountCents,
      pixKey: dto.pixKey
    });

    const withdrawal = await this.withdrawals.save(
      this.withdrawals.create({
        userId,
        amountCents: dto.amountCents,
        pixKey: dto.pixKey,
        gatewayWithdrawalId: String(response.id || response.withdrawalId || response.withdrawal?.id || '') || null,
        status: String(response.status || response.withdrawal?.status || 'PENDING').toUpperCase()
      })
    );

    return { withdrawal, gateway: response };
  }

  list(userId: string) {
    return this.withdrawals.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async refresh(userId: string, id: string) {
    const withdrawal = await this.withdrawals.findOneByOrFail({ id, userId });
    if (!withdrawal.gatewayWithdrawalId) {
      return withdrawal;
    }
    const response = await this.gateway.getWithdrawal(userId, withdrawal.gatewayWithdrawalId);
    withdrawal.status = String(response.status || response.withdrawal?.status || withdrawal.status).toUpperCase();
    return this.withdrawals.save(withdrawal);
  }

  async updateFromWebhook(gatewayWithdrawalId: string, status: string) {
    const withdrawal = await this.withdrawals.findOne({ where: { gatewayWithdrawalId } });
    if (!withdrawal) {
      return null;
    }
    withdrawal.status = status.toUpperCase();
    return this.withdrawals.save(withdrawal);
  }
}
