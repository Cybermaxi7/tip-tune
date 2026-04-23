import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TipGoal } from './tip-goal.entity';

@Entity('goal_progress_snapshots')
@Index(['goalId', 'createdAt'])
@Index(['goalId'])
export class GoalProgressSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  goalId: string;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  currentAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  previousAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  amountDelta: number;

  @Column({ type: 'int' })
  totalSupporters: number;

  @Column({ type: 'int' })
  newSupporters: number;

  @Column({ type: 'jsonb', nullable: true })
  topSupporters: any; // Array of {userId, amount, contributionCount}

  @Column({ type: 'text', nullable: true })
  snapshotTrigger: string; // 'tip_verified', 'manual', 'scheduled'

  @Column({ type: 'uuid', nullable: true })
  triggerTipId?: string; // Reference to the tip that triggered this snapshot

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => TipGoal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goalId' })
  goal: TipGoal;
}