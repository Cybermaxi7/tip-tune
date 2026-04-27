import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SelfOrAdminGuard } from '../guards/self-or-admin.guard';
import { User } from '../entities/user.entity';
import { AdminRole } from '../../admin/entities/admin-role.entity';
import { CurrentUserData } from '../../auth/decorators/current-user.decorator';

describe('SelfOrAdminGuard', () => {
  let guard: SelfOrAdminGuard;
  let reflector: Reflector;
  let userRepository: Repository<User>;
  let adminRoleRepository: Repository<AdminRole>;

  const mockUserRepository = {
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
        SelfOrAdminGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(AdminRole),
          useValue: mockAdminRoleRepository,
        },
      ],
    }).compile();

    guard = module.get<SelfOrAdminGuard>(SelfOrAdminGuard);
    reflector = module.get<Reflector>(Reflector);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    adminRoleRepository = module.get<Repository<AdminRole>>(getRepositoryToken(AdminRole));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockContext = (
    currentUser?: CurrentUserData,
    targetUserId?: string,
  ) => {
    const mockRequest = {
      user: currentUser,
      params: targetUserId ? { id: targetUserId } : {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    };
  };

  describe('Self Access', () => {
    it('should allow user to access their own data', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: false,
      };

      const context = createMockContext(currentUser, 'user-123');

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny access when user is not authenticated', async () => {
      const context = createMockContext(undefined, 'user-123');

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authentication required',
      );
    });

    it('should deny access when no target user ID is provided', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: false,
      };

      const context = createMockContext(currentUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Target user ID required',
      );
    });
  });

  describe('Admin Access', () => {
    const currentUser: CurrentUserData = {
      userId: 'admin-456',
      walletAddress: 'GADMIN1234567890123456789012345678901234567890',
      isArtist: false,
    };

    const targetUser = 'user-789';

    it('should allow admin to access other users data', async () => {
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['user_management'],
      };

      const mockUser = {
        id: 'admin-456',
        isDeleted: false,
        status: 'active',
      };

      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const context = createMockContext(currentUser, targetUser);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(mockAdminRoleRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'admin-456' },
      });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'admin-456' },
        select: ['id', 'isDeleted', 'status'],
      });
    });

    it('should deny access when admin role is not found', async () => {
      mockAdminRoleRepository.findOne.mockResolvedValue(null);

      const context = createMockContext(currentUser, targetUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own account or need admin privileges',
      );
    });

    it('should deny access when admin user is deleted', async () => {
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['user_management'],
      };

      const mockUser = {
        id: 'admin-456',
        isDeleted: true,
        status: 'active',
      };

      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const context = createMockContext(currentUser, targetUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own account or need admin privileges',
      );
    });

    it('should deny access when admin user is not found', async () => {
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['user_management'],
      };

      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);
      mockUserRepository.findOne.mockResolvedValue(null);

      const context = createMockContext(currentUser, targetUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own account or need admin privileges',
      );
    });

    it('should deny access when admin user has non-active status', async () => {
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['user_management'],
      };

      const mockUser = {
        id: 'admin-456',
        isDeleted: false,
        status: 'suspended',
      };

      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const context = createMockContext(currentUser, targetUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own account or need admin privileges',
      );
    });

    it('should allow access when admin user has no status field (null)', async () => {
      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['user_management'],
      };

      const mockUser = {
        id: 'admin-456',
        isDeleted: false,
        status: null,
      };

      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const context = createMockContext(currentUser, targetUser);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockAdminRoleRepository.findOne.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const context = createMockContext(currentUser, targetUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own account or need admin privileges',
      );
    });
  });

  describe('Non-owner, Non-admin Access', () => {
    it('should deny access when user is neither owner nor admin', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: false,
      };

      const targetUser = 'user-456';

      mockAdminRoleRepository.findOne.mockResolvedValue(null);

      const context = createMockContext(currentUser, targetUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'You can only perform this action on your own account or need admin privileges',
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed user objects gracefully', async () => {
      const malformedUser = {
        userId: undefined,
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: false,
      } as any;

      const context = createMockContext(malformedUser, 'user-123');

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authentication required',
      );
    });

    it('should handle empty params object', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: false,
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
        'Target user ID required',
      );
    });

    it('should handle null params object', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: false,
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
        'Target user ID required',
      );
    });
  });

  describe('Logging', () => {
    it('should log successful self access', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: false,
      };

      const context = createMockContext(currentUser, 'user-123');
      const loggerSpy = jest.spyOn(guard['logger'], 'debug');

      await guard.canActivate(context);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Self access granted for user: user-123',
      );
    });

    it('should log successful admin access', async () => {
      const currentUser: CurrentUserData = {
        userId: 'admin-456',
        walletAddress: 'GADMIN1234567890123456789012345678901234567890',
        isArtist: false,
      };

      const mockAdminRole = {
        userId: 'admin-456',
        permissions: ['user_management'],
      };

      const mockUser = {
        id: 'admin-456',
        isDeleted: false,
        status: 'active',
      };

      mockAdminRoleRepository.findOne.mockResolvedValue(mockAdminRole);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const context = createMockContext(currentUser, 'user-789');
      const loggerSpy = jest.spyOn(guard['logger'], 'debug');

      await guard.canActivate(context);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Admin access granted for user: admin-456 targeting user: user-789',
      );
    });

    it('should log access denial for unauthorized access', async () => {
      const currentUser: CurrentUserData = {
        userId: 'user-123',
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        isArtist: false,
      };

      mockAdminRoleRepository.findOne.mockResolvedValue(null);

      const context = createMockContext(currentUser, 'user-456');
      const loggerSpy = jest.spyOn(guard['logger'], 'warn');

      await expect(guard.canActivate(context)).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Access denied: User user-123 attempting to access user user-456 without privileges',
      );
    });
  });
});
