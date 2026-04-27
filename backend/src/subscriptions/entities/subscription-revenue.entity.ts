import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { FanSubscription } from './fan-subscription.entity';

/**
 * Tracks revenue from subscription payments for analytics and reporting.
 */
@Entity('subscription_revenue')
@Index(['subscriptionId'])
@Index(['artistId'])
@Index(['processedAt'])
export class SubscriptionRevenue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  subscriptionId: string;

  @ManyToOne(() => FanSubscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: FanSubscription;

  @Column({ name: 'artist_id', type: 'uuid' })
  @Index()
  artistId: string;

  @Column({ name: 'fan_user_id', type: 'uuid' })
  @Index()
  fanUserId: string;

  /** Amount paid in USDC */
  @Column({ name: 'amount_usdc', type: 'numeric', precision: 18, scale: 7 })
  amountUsdc: string;

  /** Amount paid in XLM (legacy support) */
  @Column({ name: 'amount_xlm', type: 'decimal', precision: 18, scale: 7, nullable: true })
  amountXlm?: number;

  /** Amount paid in USD (legacy support) */
  @Column({ name: 'amount_usd', type: 'decimal', precision: 10, scale: 2, nullable: true })
  amountUsd?: number;

  @Column({ name: 'stellar_tx_hash', type: 'text', nullable: true })
  stellarTxHash?: string;

  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;

  @Column({ name: 'billing_period_start', type: 'timestamptz' })
  billingPeriodStart: Date;

  @Column({ name: 'billing_period_end', type: 'timestamptz' })
  billingPeriodEnd: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
