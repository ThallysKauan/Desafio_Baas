import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type CheckoutMethod = 'PIX' | 'CARD';
export type CheckoutStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED';

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

  @Column()
  method: CheckoutMethod;

  @Column({ default: 'PENDING' })
  status: CheckoutStatus;

  @Column({ nullable: true })
  gatewayPaymentId: string | null;

  @Column({ nullable: true, type: 'text' })
  qrCodeBase64: string | null;

  @Column({ nullable: true, type: 'text' })
  emv: string | null;

  @Column({ nullable: true })
  installments: number | null;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 4 })
  feePercent: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
