import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '../entities/fan-subscription.entity';

export class SubscribeFanDto {
  @ApiProperty({
    description: 'ID of the subscription tier to subscribe to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  tierId: string;

  @ApiPropertyOptional({
    description: 'Stellar transaction hash for the subscription payment',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsOptional()
  stellarTxHash?: string;

  @ApiPropertyOptional({
    description: 'Initial status of the subscription',
    enum: SubscriptionStatus,
    example: SubscriptionStatus.PENDING,
  })
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    description: 'Reason for cancellation',
    example: 'No longer need the subscription',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class UpdateSubscriptionStatusDto {
  @ApiProperty({
    description: 'New status for the subscription',
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
  })
  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;

  @ApiPropertyOptional({
    description: 'Notes about the status change',
    example: 'Payment confirmed',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
