import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { AdminRole } from '../../admin/entities/admin-role.entity';
import { CurrentUserData } from '../../auth/decorators/current-user.decorator';

@Injectable()
export class SelfOrAdminGuard implements CanActivate {
  private readonly logger = new Logger(SelfOrAdminGuard.name);

  constructor(
    private reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AdminRole)
    private readonly adminRoleRepository: Repository<AdminRole>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const currentUser = request.user as CurrentUserData | undefined;
    const targetUserId = request.params?.id;

    // Validate authentication
    if (!currentUser?.userId) {
      this.logger.warn('Access denied: User not authenticated');
      throw new UnauthorizedException('Authentication required');
    }

    // Validate target user ID parameter
    if (!targetUserId) {
      this.logger.warn('Access denied: No target user ID provided');
      throw new UnauthorizedException('Target user ID required');
    }

    // Check if user is accessing their own data
    if (currentUser.userId === targetUserId) {
      this.logger.debug(`Self access granted for user: ${currentUser.userId}`);
      return true;
    }

    // Check if user has admin privileges
    const isAdmin = await this.checkAdminPrivileges(currentUser.userId);
    if (isAdmin) {
      this.logger.debug(`Admin access granted for user: ${currentUser.userId} targeting user: ${targetUserId}`);
      return true;
    }

    // Neither self nor admin - deny access
    this.logger.warn(
      `Access denied: User ${currentUser.userId} attempting to access user ${targetUserId} without privileges`,
    );
    throw new ForbiddenException(
      'You can only perform this action on your own account or need admin privileges',
    );
  }

  /**
   * Check if user has admin privileges
   */
  private async checkAdminPrivileges(userId: string): Promise<boolean> {
    try {
      const adminRole = await this.adminRoleRepository.findOne({
        where: { userId },
      });

      if (!adminRole) {
        return false;
      }

      // Additional check: ensure admin user is not deleted or suspended
      const adminUser = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'isDeleted', 'status'],
      });

      if (!adminUser || adminUser.isDeleted) {
        this.logger.warn(`Admin access denied: User ${userId} is deleted or not found`);
        return false;
      }

      // You could add additional status checks here (e.g., suspended accounts)
      if (adminUser.status && adminUser.status !== 'active') {
        this.logger.warn(`Admin access denied: User ${userId} has status: ${adminUser.status}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking admin privileges for user ${userId}: ${error.message}`);
      return false;
    }
  }
}
