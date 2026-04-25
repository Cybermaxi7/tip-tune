import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportStatus, ReportEntityType, ReportPriority } from '../entities/report.entity';

export class ReportQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportEntityType)
  entityType?: ReportEntityType;

  @IsOptional()
  @IsEnum(ReportPriority)
  priority?: ReportPriority;

  @IsOptional()
  assignedToId?: string;

  @IsOptional()
  escalated?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
