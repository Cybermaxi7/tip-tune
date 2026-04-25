import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportEnforcementService } from './report-enforcement.service';
import { Report } from './entities/report.entity';
import { User } from '../users/entities/user.entity';
import { Track } from '../tracks/entities/track.entity';
import { AdminAuditLog } from '../admin/entities/admin-audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Report, User, Track, AdminAuditLog])],
  controllers: [ReportsController],
  providers: [ReportsService, ReportEnforcementService],
  exports: [ReportsService, ReportEnforcementService],
})
export class ReportsModule {}
