import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  Check,
} from 'typeorm';
import { FanSubscription } from './fan-subscription.entity';

/**
 * Represents a monetisation tier defined by an artist.
 * e.g. "Gold Fan – 10 USDC/month"
 */
@Entity('subscription_tiers')
@Index(['artistId', 'name'], { unique: true })
@Check(`"price_usdc" >= 0`)
@Check(`"current_subscribers" >= 0`)
export class SubscriptionTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to the Artist profile (not the User). */
  @Column({ type: 'uuid' })
  @Index()
  artistId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * Price in USDC (stored as a decimal string to avoid float precision issues).
   * Must be ≥ 0; 0 is valid for free tiers.
   */
  @Column({ type: 'numeric', precision: 18, scale: 7 })
  priceUsdc: string;

  /** Legacy XLM price field for backward compatibility */
  @Column({ name: 'price_xlm', type: 'decimal', precision: 18, scale: 7, nullable: true })
  priceXLM?: number;

  /** Legacy USD price field for backward compatibility */
  @Column({ name: 'price_usd', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceUSD?: number;

  /** Billing cadence in days (e.g. 30 = monthly). */
  @Column({ type: 'int', default: 30 })
  billingCycleDays: number;

  @Column({ type: 'jsonb', default: [] })
  perks: string[];

  @Column({ name: 'max_subscribers', type: 'int', nullable: true })
  maxSubscribers: number | null;

  @Column({ name: 'current_subscribers', type: 'int', default: 0 })
  currentSubscribers: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => FanSubscription, (sub) => sub.tier, { lazy: true })
  subscriptions: Promise<FanSubscription[]>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
