import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  amountCents: number;

  @Column()
  pixKey: string;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ nullable: true, type: 'varchar', length: 120 })
  gatewayWithdrawalId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
