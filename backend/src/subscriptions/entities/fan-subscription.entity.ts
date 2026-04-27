import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { SubscriptionTier } from './subscription-tier.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PAUSED = 'paused',
  PENDING = 'pending',
}

/**
 * Records a fan's subscription to a specific artist tier.
 *
 * Identity note: `fanUserId` is the User.id of the subscriber — not an
 * artistId. This is intentional: fans subscribe as users, not as artists.
 */
@Entity('fan_subscriptions')
@Index(['fanUserId', 'tierId'], { unique: true })
@Index(['fanUserId', 'status'])
@Index(['tierId', 'status'])
export class FanSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User.id of the subscribing fan (canonical user identity). */
  @Column({ type: 'uuid' })
  @Index()
  fanUserId: string;

  /** Artist ID for easy querying (redundant but useful) */
  @Column({ name: 'artist_id', type: 'uuid' })
  @Index()
  artistId: string;

  @Column({ type: 'uuid' })
  @Index()
  tierId: string;

  @ManyToOne(() => SubscriptionTier, (tier) => tier.subscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tierId' })
  tier: SubscriptionTier;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.PENDING,
  })
  status: SubscriptionStatus;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate: Date;

  @Column({ name: 'next_billing_date', type: 'timestamptz', nullable: true })
  nextBillingDate?: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt?: Date;

  /** Stellar transaction ID of the most recent payment. */
  @Column({ name: 'stellar_tx_hash', nullable: true })
  stellarTxHash?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
