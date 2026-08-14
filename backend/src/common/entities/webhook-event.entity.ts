import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventType: string;

  @Column({ nullable: true })
  externalReference: string;

  @Column({ nullable: true })
  gatewayId: string;

  @Column({ default: false })
  processed: boolean;

  @Column({ type: 'json' })
  payload: unknown;

  @CreateDateColumn()
  createdAt: Date;
}
