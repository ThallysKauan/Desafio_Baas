import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckoutLink } from '../common/entities/checkout-link.entity';
import { Withdrawal } from '../common/entities/withdrawal.entity';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawalsService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawals: Repository<Withdrawal>,
    @InjectRepository(CheckoutLink)
    private readonly checkoutLinks: Repository<CheckoutLink>
  ) {}

  async create(userId: string, dto: CreateWithdrawalDto) {
    const balanceCents = await this.getAvailableBalanceCents(userId);
    if (dto.amountCents > balanceCents) {
      throw new BadRequestException('Saldo insuficiente para solicitar este saque');
    }

    const withdrawal = await this.withdrawals.save(
      this.withdrawals.create({
        userId,
        amountCents: dto.amountCents,
        pixKey: dto.pixKey,
        gatewayWithdrawalId: null,
        status: 'PENDING'
      })
    );

    return withdrawal;
  }

  list(userId: string) {
    return this.withdrawals.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async refresh(userId: string, id: string) {
    const withdrawal = await this.withdrawals.findOneByOrFail({ id, userId });
    if (!withdrawal.gatewayWithdrawalId) {
      return withdrawal;
    }
    return withdrawal;
  }

  async updateFromWebhook(gatewayWithdrawalId: string, status: string) {
    const withdrawal = await this.withdrawals.findOne({ where: { gatewayWithdrawalId } });
    if (!withdrawal) {
      return null;
    }
    withdrawal.status = status.toUpperCase();
    return this.withdrawals.save(withdrawal);
  }

  private async getAvailableBalanceCents(userId: string) {
    const [checkouts, withdrawals] = await Promise.all([
      this.checkoutLinks.find({ where: { userId } }),
      this.withdrawals.find({ where: { userId } })
    ]);

    const receivedCents = checkouts
      .filter((checkout) => checkout.status === 'APPROVED')
      .reduce((total, checkout) => total + Number(checkout.amountCents || 0), 0);

    const withdrawnCents = withdrawals
      .filter((withdrawal) => !['DENIED', 'CANCELLED', 'FAILED', 'REJECTED'].includes(withdrawal.status.toUpperCase()))
      .reduce((total, withdrawal) => total + Number(withdrawal.amountCents || 0), 0);

    return receivedCents - withdrawnCents;
  }
}
