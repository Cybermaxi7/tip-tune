import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus, ReportAction, ReportEntityType, ReportPriority } from './entities/report.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { User, UserStatus } from '../users/entities/user.entity';
import { Track } from '../tracks/entities/track.entity';
import { ReportEnforcementService } from './report-enforcement.service';
import { AdminAuditLog } from '../admin/entities/admin-audit-log.entity';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Filter = require('bad-words');

@Injectable()
export class ReportsService {
  private filter: any;

  constructor(
    @InjectRepository(Report)
    private reportsRepository: Repository<Report>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Track)
    private tracksRepository: Repository<Track>,
    @InjectRepository(AdminAuditLog)
    private auditLogRepository: Repository<AdminAuditLog>,
    private enforcementService: ReportEnforcementService,
  ) {
    this.filter = new Filter();
  }

  async create(createReportDto: CreateReportDto, user: User): Promise<Report> {
    const report = this.reportsRepository.create({
      ...createReportDto,
      reportedBy: user,
    });
    return this.reportsRepository.save(report);
  }

  async findAll(
    query: ReportQueryDto,
  ): Promise<{ data: Report[]; total: number; limit: number; offset: number }> {
    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.entityType) where.entityType = query.entityType;
    if (query.priority) where.priority = query.priority;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.escalated !== undefined) where.escalated = query.escalated;

    const [data, total] = await this.reportsRepository.findAndCount({
      where,
      relations: ['reportedBy', 'reviewedBy', 'assignedTo'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { data, total, limit, offset };
  }

  async findOne(id: string): Promise<Report> {
    const report = await this.reportsRepository.findOne({
      where: { id },
      relations: ['reportedBy', 'reviewedBy'],
    });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return report;
  }

  private static readonly VALID_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
    [ReportStatus.PENDING]: [ReportStatus.UNDER_REVIEW],
    [ReportStatus.UNDER_REVIEW]: [ReportStatus.RESOLVED, ReportStatus.DISMISSED],
    [ReportStatus.RESOLVED]: [],
    [ReportStatus.DISMISSED]: [],
  };

  async updateStatus(id: string, updateDto: UpdateReportStatusDto, admin: User): Promise<Report> {
    const report = await this.findOne(id);

    const allowedNext = ReportsService.VALID_TRANSITIONS[report.status];
    if (!allowedNext.includes(updateDto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${report.status} to ${updateDto.status}`,
      );
    }

    report.status = updateDto.status;
    report.reviewedBy = admin;
    report.reviewedAt = new Date();
    if (updateDto.reviewNotes) report.reviewNotes = updateDto.reviewNotes;
    if (updateDto.action) report.action = updateDto.action;
    if (updateDto.priority) report.priority = updateDto.priority;

    if (updateDto.status === ReportStatus.RESOLVED || updateDto.status === ReportStatus.DISMISSED) {
      report.resolvedAt = new Date();
    }

    if (updateDto.action && updateDto.action !== ReportAction.NONE) {
      const ipAddress = '0.0.0.0';
      await this.enforcementService.applyEnforcement(
        report,
        updateDto.action,
        admin,
        ipAddress,
      );
    }

    return this.reportsRepository.save(report);
  }

  async assignReport(id: string, assigneeId: string, admin: User): Promise<Report> {
    const report = await this.findOne(id);
    const assignee = await this.usersRepository.findOne({ where: { id: assigneeId } });
    if (!assignee) {
      throw new NotFoundException(`User with ID ${assigneeId} not found`);
    }
    report.assignedTo = assignee;
    report.assignedToId = assigneeId;
    report.status = ReportStatus.UNDER_REVIEW;
    report.reviewedBy = admin;
    report.reviewedAt = new Date();
    return this.reportsRepository.save(report);
  }

  async escalateReport(id: string, admin: User): Promise<Report> {
    const report = await this.findOne(id);
    report.escalated = true;
    report.priority = ReportPriority.CRITICAL;
    report.reviewedBy = admin;
    report.reviewedAt = new Date();
    return this.reportsRepository.save(report);
  }

  checkProfanity(text: string): boolean {
    return this.filter.isProfane(text);
  }
}
