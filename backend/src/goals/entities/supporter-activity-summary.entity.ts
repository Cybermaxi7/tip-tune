import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { TipGoal } from './tip-goal.entity';
import { User } from '../../users/entities/user.entity';

@Entity('supporter_activity_summaries')
@Index(['goalId', 'userId'])
@Index(['goalId', 'totalAmount', 'lastActivityAt'])
@Unique(['goalId', 'userId'])
export class SupporterActivitySummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  goalId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'decimal', precision: 20, scale: 7, default: 0 })
  totalAmount: number;

  @Column({ type: 'int', default: 0 })
  contributionCount: number;

  @Column({ type: 'decimal', precision: 20, scale: 7, default: 0 })
  averageContribution: number;

  @Column({ type: 'timestamp', nullable: true })
  firstContributionAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastContributionAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  contributionHistory: any; // Array of {amount, timestamp, tipId}

  @Column({ type: 'text', nullable: true })
  rewardTier?: string;

  @Column({ type: 'boolean', default: false })
  isAnonymous: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => TipGoal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goalId' })
  goal: TipGoal;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}