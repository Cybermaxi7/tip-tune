import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsNotEmpty,
  Min,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BillingCycle {
  MONTHLY = 30,
  QUARTERLY = 90,
  YEARLY = 365,
}

export class CreateSubscriptionTierDto {
  @ApiProperty({
    description: 'Name of the subscription tier',
    example: 'Gold Fan',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Description of what this tier includes',
    example: 'Exclusive content, early access, and monthly Q&A sessions',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Price in USDC (as decimal string)',
    example: '10.0000000',
  })
  @IsString()
  @IsNotEmpty()
  @Min(0)
  priceUsdc: string;

  @ApiPropertyOptional({
    description: 'Legacy price in XLM for backward compatibility',
    example: 50,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  priceXLM?: number;

  @ApiPropertyOptional({
    description: 'Legacy price in USD for backward compatibility',
    example: 10.50,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  priceUSD?: number;

  @ApiPropertyOptional({
    description: 'Billing cycle in days',
    example: 30,
    enum: BillingCycle,
  })
  @IsNumber()
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycleDays?: number;

  @ApiPropertyOptional({
    description: 'List of perks included in this tier',
    example: ['Exclusive content', 'Early access', 'Monthly Q&A'],
    default: [],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  perks?: string[];

  @ApiPropertyOptional({
    description: 'Maximum number of subscribers allowed',
    example: 100,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxSubscribers?: number;

  @ApiPropertyOptional({
    description: 'Whether this tier is currently active',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
