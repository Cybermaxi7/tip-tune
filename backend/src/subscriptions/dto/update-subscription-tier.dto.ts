import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  MaxLength,
  Min,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BillingCycle } from './create-subscription-tier.dto';

export class UpdateSubscriptionTierDto {
  @ApiPropertyOptional({
    description: 'Updated name of the subscription tier',
    example: 'Platinum Fan',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated description of what this tier includes',
    example: 'All Gold benefits plus exclusive merchandise',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated price in USDC (as decimal string)',
    example: '25.0000000',
  })
  @IsString()
  @IsOptional()
  @Min(0)
  priceUsdc?: string;

  @ApiPropertyOptional({
    description: 'Updated legacy price in XLM for backward compatibility',
    example: 100,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  priceXLM?: number;

  @ApiPropertyOptional({
    description: 'Updated legacy price in USD for backward compatibility',
    example: 25.00,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  priceUSD?: number;

  @ApiPropertyOptional({
    description: 'Updated billing cycle in days',
    example: 30,
    enum: BillingCycle,
  })
  @IsNumber()
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycleDays?: number;

  @ApiPropertyOptional({
    description: 'Updated list of perks included in this tier',
    example: ['Exclusive content', 'Early access', 'Monthly Q&A', 'Exclusive merchandise'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  perks?: string[];

  @ApiPropertyOptional({
    description: 'Updated maximum number of subscribers allowed',
    example: 50,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxSubscribers?: number;

  @ApiPropertyOptional({
    description: 'Whether this tier is currently active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
