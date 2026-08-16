import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckoutLink } from '../common/entities/checkout-link.entity';
import { Withdrawal } from '../common/entities/withdrawal.entity';

type WalletTransaction = {
  id: string;
  type: string;
  method: string;
  status: string;
  description: string;
  amountCents: number;
  createdAt: Date;
};

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(CheckoutLink)
    private readonly checkoutLinks: Repository<CheckoutLink>,
    @InjectRepository(Withdrawal)
    private readonly withdrawals: Repository<Withdrawal>
  ) {}

  async getBalance(userId: string) {
    const [checkouts, withdrawals] = await Promise.all([
      this.checkoutLinks.find({ where: { userId } }),
      this.withdrawals.find({ where: { userId } })
    ]);

    const receivedCents = checkouts
      .filter((checkout) => checkout.status === 'APPROVED')
      .reduce((total, checkout) => total + Number(checkout.amountCents || 0), 0);

    const withdrawnCents = withdrawals
      .filter((withdrawal) => this.debitsBalance(withdrawal.status))
      .reduce((total, withdrawal) => total + Number(withdrawal.amountCents || 0), 0);

    return {
      balanceCents: receivedCents - withdrawnCents,
      receivedCents,
      withdrawnCents
    };
  }

  async getTransactions(userId: string, filters: { status?: string; type?: string; limit?: string | number }) {
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
    const wantedStatus = filters.status?.toUpperCase();
    const wantedType = filters.type?.toUpperCase();

    const [checkouts, withdrawals] = await Promise.all([
      this.checkoutLinks.find({ where: { userId } }),
      this.withdrawals.find({ where: { userId } })
    ]);

    const paymentTransactions: WalletTransaction[] = checkouts.map((checkout) => ({
      id: checkout.id,
      type: checkout.method,
      method: checkout.method,
      status: checkout.status,
      description: checkout.description,
      amountCents: Number(checkout.amountCents || 0),
      createdAt: checkout.updatedAt || checkout.createdAt
    }));

    const withdrawalTransactions: WalletTransaction[] = withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      type: 'WITHDRAWAL',
      method: 'PIX',
      status: withdrawal.status,
      description: `Saque para ${withdrawal.pixKey}`,
      amountCents: -Number(withdrawal.amountCents || 0),
      createdAt: withdrawal.updatedAt || withdrawal.createdAt
    }));

    return [...paymentTransactions, ...withdrawalTransactions]
      .filter((transaction) => !wantedStatus || transaction.status.toUpperCase() === wantedStatus)
      .filter((transaction) => !wantedType || transaction.type === wantedType || transaction.method === wantedType)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  private debitsBalance(status: string) {
    return !['DENIED', 'CANCELLED', 'FAILED', 'REJECTED'].includes(status.toUpperCase());
  }
}
