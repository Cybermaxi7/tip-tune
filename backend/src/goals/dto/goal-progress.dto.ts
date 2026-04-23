import { IsUUID, IsNumber, IsDateString, IsOptional, IsString } from 'class-validator';

export class GoalProgressSnapshotDto {
  @IsUUID()
  id: string;

  @IsUUID()
  goalId: string;

  @IsNumber()
  currentAmount: number;

  @IsNumber()
  previousAmount: number;

  @IsNumber()
  amountDelta: number;

  @IsNumber()
  totalSupporters: number;

  @IsNumber()
  newSupporters: number;

  topSupporters?: any[];

  @IsString()
  snapshotTrigger: string;

  @IsOptional()
  @IsUUID()
  triggerTipId?: string;

  @IsDateString()
  createdAt: Date;
}

export class SupporterActivitySummaryDto {
  @IsUUID()
  id: string;

  @IsUUID()
  goalId: string;

  @IsUUID()
  userId: string;

  @IsNumber()
  totalAmount: number;

  @IsNumber()
  contributionCount: number;

  @IsNumber()
  averageContribution: number;

  @IsOptional()
  @IsDateString()
  firstContributionAt?: Date;

  @IsOptional()
  @IsDateString()
  lastContributionAt?: Date;

  contributionHistory?: any[];

  @IsOptional()
  @IsString()
  rewardTier?: string;

  @IsDateString()
  createdAt: Date;

  @IsDateString()
  updatedAt: Date;

  user?: any; // Simplified user object
}

export class GoalProgressStatsDto {
  @IsNumber()
  totalProgress: number;

  @IsNumber()
  totalSupporters: number;

  @IsNumber()
  averageContribution: number;

  @IsNumber()
  progressRate: number;

  snapshots: GoalProgressSnapshotDto[];

  topSupporters: any[];
}