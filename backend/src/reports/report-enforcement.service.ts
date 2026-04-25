import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportAction, ReportEntityType } from './entities/report.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { Track } from '../tracks/entities/track.entity';
import { AdminAuditLog } from '../admin/entities/admin-audit-log.entity';

export interface EnforcementAction {
  type: ReportAction;
  entityId: string;
  entityType: ReportEntityType;
  targetUser?: User;
  targetTrack?: Track;
}

@Injectable()
export class ReportEnforcementService {
  private readonly logger = new Logger(ReportEnforcementService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Track)
    private tracksRepository: Repository<Track>,
    @InjectRepository(AdminAuditLog)
    private auditLogRepository: Repository<AdminAuditLog>,
  ) {}

  async applyEnforcement(
    report: Report,
    action: ReportAction,
    admin: User,
    ipAddress: string,
  ): Promise<EnforcementAction | null> {
    if (action === ReportAction.NONE) {
      return null;
    }

    let previousState: any;
    let newState: any;
    const enforcement: EnforcementAction = {
      type: action,
      entityId: report.entityId,
      entityType: report.entityType,
    };

    try {
      if (action === ReportAction.USER_BANNED && report.entityType === ReportEntityType.USER) {
        const user = await this.usersRepository.findOne({ where: { id: report.entityId } });
        if (user) {
          previousState = { status: user.status };
          await this.usersRepository.update(report.entityId, { status: UserStatus.BANNED });
          enforcement.targetUser = user;
          newState = { status: UserStatus.BANNED };
        }
      } else if (
        action === ReportAction.CONTENT_REMOVED &&
        report.entityType === ReportEntityType.TRACK
      ) {
        const track = await this.tracksRepository.findOne({ where: { id: report.entityId } });
        if (track) {
          previousState = { isPublic: track.isPublic };
          await this.tracksRepository.update(report.entityId, { isPublic: false });
          enforcement.targetTrack = track;
          newState = { isPublic: false };
        }
      }

      await this.createAuditLog({
        adminId: admin.id,
        admin,
        action: `ENFORCEMENT_${action}`,
        entityType: report.entityType,
        entityId: report.entityId,
        previousState,
        newState,
        reason: `Report #${report.id}: ${report.reason}`,
        ipAddress,
      });

      this.logger.log(
        `Applied enforcement action ${action} for report ${report.id}`,
      );

      return enforcement;
    } catch (error) {
      this.logger.error(
        `Failed to apply enforcement action ${action}: ${error.message}`,
      );
      throw error;
    }
  }

  async reverseEnforcement(
    enforcement: EnforcementAction,
    admin: User,
    ipAddress: string,
  ): Promise<void> {
    try {
      if (enforcement.type === ReportAction.USER_BANNED && enforcement.targetUser) {
        const previousState = { status: enforcement.targetUser.status };
        const newStatus = enforcement.targetUser.status === UserStatus.BANNED ? UserStatus.ACTIVE : enforcement.targetUser.status;
        await this.usersRepository.update(enforcement.entityId, {
          status: newStatus,
        });

        await this.createAuditLog({
          adminId: admin.id,
          admin,
          action: `ENFORCEMENT_REVERSED_${enforcement.type}`,
          entityType: enforcement.entityType,
          entityId: enforcement.entityId,
          previousState,
          newState: { status: newStatus },
          reason: 'Enforcement reversal requested',
          ipAddress,
        });
      } else if (
        enforcement.type === ReportAction.CONTENT_REMOVED &&
        enforcement.targetTrack
      ) {
        const previousState = { isPublic: enforcement.targetTrack.isPublic };
        await this.tracksRepository.update(enforcement.entityId, {
          isPublic: true,
        });

        await this.createAuditLog({
          adminId: admin.id,
          admin,
          action: `ENFORCEMENT_REVERSED_${enforcement.type}`,
          entityType: enforcement.entityType,
          entityId: enforcement.entityId,
          previousState,
          newState: { isPublic: true },
          reason: 'Enforcement reversal requested',
          ipAddress,
        });
      }

      this.logger.log(
        `Reversed enforcement action ${enforcement.type} for entity ${enforcement.entityId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to reverse enforcement: ${error.message}`,
      );
      throw error;
    }
  }

  private async createAuditLog(data: {
    adminId: string;
    admin: User;
    action: string;
    entityType: string;
    entityId: string;
    previousState?: any;
    newState?: any;
    reason?: string;
    ipAddress: string;
  }): Promise<AdminAuditLog> {
    const auditLog = this.auditLogRepository.create({
      adminId: data.adminId,
      admin: data.admin,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      previousState: data.previousState,
      newState: data.newState,
      reason: data.reason,
      ipAddress: data.ipAddress,
    });

    return this.auditLogRepository.save(auditLog);
  }
}
