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
import { Artist } from '../entities/artist.entity';
import { AdminRole } from '../../admin/entities/admin-role.entity';
import { CurrentUserData } from '../../auth/decorators/current-user.decorator';

@Injectable()
export class ArtistOwnerGuard implements CanActivate {
  private readonly logger = new Logger(ArtistOwnerGuard.name);

  constructor(
    private reflector: Reflector,
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,
    @InjectRepository(AdminRole)
    private readonly adminRoleRepository: Repository<AdminRole>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const currentUser = request.user as CurrentUserData | undefined;
    const targetArtistId = request.params?.artistId || request.params?.id;

    // Validate authentication
    if (!currentUser?.userId) {
      this.logger.warn('Access denied: User not authenticated');
      throw new UnauthorizedException('Authentication required');
    }

    // Validate target artist ID parameter
    if (!targetArtistId) {
      this.logger.warn('Access denied: No target artist ID provided');
      throw new UnauthorizedException('Target artist ID required');
    }

    // Find the artist to verify ownership
    const artist = await this.findArtist(targetArtistId);
    if (!artist) {
      this.logger.warn(`Access denied: Artist ${targetArtistId} not found`);
      throw new ForbiddenException('Artist not found');
    }

    // Check if user owns this artist profile
    if (artist.userId === currentUser.userId) {
      this.logger.debug(`Artist owner access granted: User ${currentUser.userId} owns artist ${targetArtistId}`);
      return true;
    }

    // Check if user has admin privileges
    const isAdmin = await this.checkAdminPrivileges(currentUser.userId);
    if (isAdmin) {
      this.logger.debug(`Admin access granted for artist: User ${currentUser.userId} targeting artist ${targetArtistId}`);
      return true;
    }

    // Neither owner nor admin - deny access
    this.logger.warn(
      `Access denied: User ${currentUser.userId} attempting to access artist ${targetArtistId} without ownership or admin privileges`,
    );
    throw new ForbiddenException(
      'You can only perform this action on your own artist profile or need admin privileges',
    );
  }

  /**
   * Find artist by ID, including soft-deleted ones for admin operations
   */
  private async findArtist(artistId: string): Promise<Artist | null> {
    try {
      // First try to find non-deleted artist
      const artist = await this.artistRepository.findOne({
        where: { id: artistId, isDeleted: false },
        relations: ['user'],
      });

      if (artist) {
        return artist;
      }

      // If not found, try to find soft-deleted artist (for restore operations)
      const deletedArtist = await this.artistRepository.findOne({
        where: { id: artistId },
        withDeleted: true,
        relations: ['user'],
      });

      return deletedArtist;
    } catch (error) {
      this.logger.error(`Error finding artist ${artistId}: ${error.message}`);
      return null;
    }
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
      const artist = await this.artistRepository.findOne({
        where: { userId },
        select: ['id', 'isDeleted'],
        relations: ['user'],
      });

      if (!artist || artist.isDeleted) {
        this.logger.warn(`Admin access denied: User ${userId} is deleted or not found`);
        return false;
      }

      // Check user status through the artist relationship
      if (artist.user && artist.user.status && artist.user.status !== 'active') {
        this.logger.warn(`Admin access denied: User ${userId} has status: ${artist.user.status}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking admin privileges for user ${userId}: ${error.message}`);
      return false;
    }
  }
}
