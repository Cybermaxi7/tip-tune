import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArtistOwnerGuard } from '../guards/artist-owner.guard';
import { Artist } from '../entities/artist.entity';
import { AdminRole } from '../../admin/entities/admin-role.entity';
import { User } from '../../users/entities/user.entity';
import { CurrentUserData } from '../../auth/decorators/current-user.decorator';

describe('ArtistOwnerGuard', () => {
  let guard: ArtistOwnerGuard;
  let reflector: Reflector;
  let artistRepository: Repository<Artist>;
  let adminRoleRepository: Repository<AdminRole>;

  const mockArtistRepository = {
    findOne: jest.fn(),
  };

  const mockAdminRoleRepository = {
    findOne: jest.fn(),
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArtistOwnerGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: getRepositoryToken(Artist),
          useValue: mockArtistRepository,
        },
        {
          provide: getRepositoryToken(AdminRole),
          useValue: mockAdminRoleRepository,
        },
      ],
    }).compile();

    guard = module.get<ArtistOwnerGuard>(ArtistOwnerGuard);
    reflector = module.get<Reflector>(Reflector);
    artistRepository = module.get<Repository<Artist>>(getRepositoryToken(Artist));
    adminRoleRepository = module.get<Repository<AdminRole>>(getRepositoryToken(AdminRole));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockContext = (
    currentUser?: CurrentUserData,
    targetArtistId?: string,
  ) => {
    const mockRequest = {
      user: currentUser,
      params: targetArtistId ? { artistId: targetArtistId } : {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    };
  };

  const createMockArtist = (userId: string, isDeleted = false): Artist => ({
    id: 'artist-123',
    userId,
    artistName: 'Test Artist',
    genre: 'Pop',
    bio: 'Test bio',
    walletAddress: 'GTEST1234567890123456789012345678901234567890',
    isVerified: false,
    status: 'active',
    country: null,
    city: null,
    hasLocation: false,
    totalTipsReceived: '0',
    emailNotifications: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: isDeleted ? new Date() : null,
    isDeleted,
    user: {
      id: userId,
      username: 'testuser',
      email: 'test@example.com',
      walletAddress: 'GTEST1234567890123456789012345678901234567890',
      isArtist: true,
      role: 'user',
      status: 'active',
      profileImage: null,
      bio: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      isDeleted: false,
    } as User,
  });

  describe('Artist Owner Access', () => {
    it('should allow artist to access their own profile', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const mockArtist = createMockArtist('user-123');
      mockArtistRepository.findOne.mockResolvedValue(mockArtist);

      const context = createMockContext(currentUser, 'artist-123');

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow artist to access their own soft-deleted profile', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const mockArtist = createMockArtist('user-123', true);
      mockArtistRepository.findOne.mockResolvedValue(mockArtist);

      const context = createMockContext(currentUser, 'artist-123');

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny access when user is not authenticated', async () => {
      const context = createMockContext(undefined, 'artist-123');

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authentication required',
      );
    });

    it('should deny access when no target artist ID is provided', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const context = createMockContext(currentUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Target artist ID required',
      );
    });
  });

  describe('Admin Access', () => {
    const currentUser: CurrentUserData = {
      userId: 'admin-456',
      walletAddress: 'GADMIN1234567890123456789012345678901234567890',
      isArtist: false,
    };

    const targetArtistId = 'artist-789';

    it('should allow admin to access any artist profile', async () => {
      const mockArtist = createMockArtist('user-789');
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['artist_management'],
      };

      const mockAdminArtist = createMockArtist('admin-456');
      mockAdminArtist.user.status = 'active';

      mockArtistRepository.findOne.mockResolvedValue(mockArtist);
      mockArtistRepository.findOne.mockResolvedValue(mockAdminArtist);
      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);

      const context = createMockContext(currentUser, targetArtistId);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny access when admin role is not found', async () => {
      const mockArtist = createMockArtist('user-789');
      mockArtistRepository.findOne.mockResolvedValue(mockArtist);
      mockAdminRoleRepository.findOne.mockResolvedValue(null);

      const context = createMockContext(currentUser, targetArtistId);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own artist profile or need admin privileges',
      );
    });

    it('should deny access when admin artist is deleted', async () => {
      const mockArtist = createMockArtist('user-789');
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['artist_management'],
      };

      const mockAdminArtist = createMockArtist('admin-456', true);
      mockAdminArtist.user.status = 'active';

      mockArtistRepository.findOne.mockResolvedValue(mockArtist);
      mockArtistRepository.findOne.mockResolvedValue(mockAdminArtist);
      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);

      const context = createMockContext(currentUser, targetArtistId);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own artist profile or need admin privileges',
      );
    });

    it('should deny access when admin user has non-active status', async () => {
      const mockArtist = createMockArtist('user-789');
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['artist_management'],
      };

      const mockAdminArtist = createMockArtist('admin-456');
      mockAdminArtist.user.status = 'suspended';

      mockArtistRepository.findOne.mockResolvedValue(mockArtist);
      mockArtistRepository.findOne.mockResolvedValue(mockAdminArtist);
      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);

      const context = createMockContext(currentUser, targetArtistId);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own artist profile or need admin privileges',
      );
    });

    it('should allow access when admin user has no status field (null)', async () => {
      const mockArtist = createMockArtist('user-789');
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['artist_management'],
      };

      const mockAdminArtist = createMockArtist('admin-456');
      mockAdminArtist.user.status = null;

      mockArtistRepository.findOne.mockResolvedValue(mockArtist);
      mockArtistRepository.findOne.mockResolvedValue(mockAdminArtist);
      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);

      const context = createMockContext(currentUser, targetArtistId);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockAdminRoleRepository.findOne.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const context = createMockContext(currentUser, targetArtistId);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own artist profile or need admin privileges',
      );
    });
  });

  describe('Non-owner, Non-admin Access', () => {
    it('should deny access when user is neither owner nor admin', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const targetArtistId = 'artist-456';
      const mockArtist = createMockArtist('user-456');

      mockArtistRepository.findOne.mockResolvedValue(mockArtist);
      mockAdminRoleRepository.findOne.mockResolvedValue(null);

      const context = createMockContext(currentUser, targetArtistId);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own artist profile or need admin privileges',
      );
    });
  });

  describe('Artist Not Found', () => {
    it('should deny access when artist is not found', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const targetArtistId = 'non-existent-artist';

      mockArtistRepository.findOne.mockResolvedValue(null);

      const context = createMockContext(currentUser, targetArtistId);

      await expect(guard.canActivate(context)).rejects.toThrow('Artist not found');
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed user objects gracefully', async () => {
      const malformedUser = {
        userId: undefined,
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      } as any;

      const context = createMockContext(malformedUser, 'artist-123');

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authentication required',
      );
    });

    it('should handle empty params object', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: currentUser,
            params: {},
          }),
        }),
      };

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Target artist ID required',
      );
    });

    it('should handle null params object', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: currentUser,
            params: null,
          }),
        }),
      };

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Target artist ID required',
      );
    });

    it('should handle alternative parameter name (id instead of artistId)', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const mockArtist = createMockArtist('user-123');
      mockArtistRepository.findOne.mockResolvedValue(mockArtist);

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: currentUser,
            params: { id: 'artist-123' },
          }),
        }),
      };

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('Logging', () => {
    it('should log successful owner access', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const mockArtist = createMockArtist('user-123');
      mockArtistRepository.findOne.mockResolvedValue(mockArtist);

      const context = createMockContext(currentUser, 'artist-123');
      const loggerSpy = jest.spyOn(guard['logger'], 'debug');

      await guard.canActivate(context);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Artist owner access granted: User user-123 owns artist artist-123',
      );
    });

    it('should log successful admin access', async () => {
      const currentUser: CurrentUserData = {
        userId: 'admin-456',
        walletAddress: 'GADMIN1234567890123456789012345678901234567890',
        isArtist: false,
      };

      const mockArtist = createMockArtist('user-789');
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['artist_management'],
      };

      const mockAdminArtist = createMockArtist('admin-456');
      mockAdminArtist.user.status = 'active';

      mockArtistRepository.findOne.mockResolvedValue(mockArtist);
      mockArtistRepository.findOne.mockResolvedValue(mockAdminArtist);
      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);

      const context = createMockContext(currentUser, 'artist-789');
      const loggerSpy = jest.spyOn(guard['logger'], 'debug');

      await guard.canActivate(context);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Admin access granted for artist: User admin-456 targeting artist artist-789',
      );
    });

    it('should log access denial for unauthorized access', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: true,
      };

      const mockArtist = createMockArtist('user-456');
      mockArtistRepository.findOne.mockResolvedValue(mockArtist);
      mockAdminRoleRepository.findOne.mockResolvedValue(null);

      const context = createMockContext(currentUser, 'artist-456');
      const loggerSpy = jest.spyOn(guard['logger'], 'warn');

      await expect(guard.canActivate(context)).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Access denied: User user-123 attempting to access artist artist-456 without ownership or admin privileges',
      );
    });
  });
});
