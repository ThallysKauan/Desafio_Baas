import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type CheckoutMethod = 'PIX' | 'CARD' | 'BOTH';
export type CheckoutStatus = 'OPEN' | 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED';

@Entity('checkout_links')
export class CheckoutLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  externalReference: string;

  @Column()
  description: string;

  @Column()
  amountCents: number;

  @Column({ nullable: true, type: 'varchar', length: 180 })
  customerEmail: string | null;

  @Column({ nullable: true, type: 'varchar', length: 14 })
  payerDocument: string | null;

  @Column({ type: 'varchar', length: 20 })
  method: CheckoutMethod;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: CheckoutStatus;

  @Column({ nullable: true, type: 'text' })
  failureReason: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ nullable: true, type: 'datetime' })
  lastAttemptAt: Date | null;

  @Column({ nullable: true, type: 'varchar', length: 120 })
  gatewayPaymentId: string | null;

  @Column({ nullable: true, type: 'text' })
  qrCodeBase64: string | null;

  @Column({ nullable: true, type: 'text' })
  emv: string | null;

  @Column({ nullable: true, type: 'int' })
  installments: number | null;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 4 })
  feePercent: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
