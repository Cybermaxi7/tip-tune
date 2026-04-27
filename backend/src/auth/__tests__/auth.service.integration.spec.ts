import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth.service';
import { AuthRedisService } from '../services/auth-redis.service';
import { User } from '../../users/entities/user.entity';
import { VerifySignatureDto } from '../dto/verify-signature.dto';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('AuthService Integration', () => {
  let service: AuthService;
  let authRedisService: AuthRedisService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;
  let module: TestingModule;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config = {
        JWT_SECRET: 'test-secret-key',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: undefined,
        REDIS_DB: 1, // Use different DB for tests
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        AuthRedisService,
        JwtService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    authRedisService = module.get<AuthRedisService>(AuthRedisService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);

    // Initialize the service
    await service.onModuleInit();
  });

  afterEach(async () => {
    // Clean up Redis and service
    await authRedisService.disconnect();
    await service.onModuleDestroy();
    await module.close();
  });

  describe('generateChallenge', () => {
    it('should generate a valid challenge', async () => {
      const publicKey = 'GTEST1234567890123456789012345678901234567890';
      
      const result = await service.generateChallenge(publicKey);

      expect(result).toHaveProperty('challengeId');
      expect(result).toHaveProperty('challenge');
      expect(result).toHaveProperty('expiresAt');
      expect(result.challenge).toContain(publicKey);
      expect(result.challenge).toContain(result.challengeId);
      
      // Verify challenge is stored in Redis
      const storedChallenge = await authRedisService.getChallenge(result.challengeId);
      expect(storedChallenge).toBeTruthy();
      expect(storedChallenge.publicKey).toBe(publicKey);
    });

    it('should reject invalid Stellar public key', async () => {
      const invalidPublicKey = 'invalid-key';

      await expect(service.generateChallenge(invalidPublicKey)).rejects.toThrow(
        'Invalid Stellar public key format',
      );
    });
  });

  describe('verifySignature', () => {
    const validPublicKey = 'GTEST1234567890123456789012345678901234567890';
    let mockUser: User;

    beforeEach(() => {
      mockUser = {
        id: 'user-123',
        walletAddress: validPublicKey,
        username: 'testuser',
        email: 'test@example.com',
        isArtist: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    it('should verify signature and create new user', async () => {
      // Generate challenge first
      const challenge = await service.generateChallenge(validPublicKey);
      
      // Mock user not found (new user)
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);

      // Mock Stellar signature verification
      jest.spyOn(StellarSdk, 'Keypair').mockImplementation({
        fromPublicKey: jest.fn().mockReturnValue({
          verify: jest.fn().mockReturnValue(true),
        }),
      } as any);

      const verifyDto: VerifySignatureDto = {
        challengeId: challenge.challengeId,
        publicKey: validPublicKey,
        signature: 'valid-signature',
      };

      const result = await service.verifySignature(verifyDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.walletAddress).toBe(validPublicKey);
      
      // Verify challenge is deleted
      const storedChallenge = await authRedisService.getChallenge(challenge.challengeId);
      expect(storedChallenge).toBeNull();
      
      // Verify refresh token is stored
      const refreshTokenPayload = jwtService.verify(result.refreshToken);
      const storedToken = await authRedisService.getRefreshToken(refreshTokenPayload.tokenId);
      expect(storedToken).toBeTruthy();
      expect(storedToken.userId).toBe(mockUser.id);
    });

    it('should verify signature and return existing user', async () => {
      // Generate challenge first
      const challenge = await service.generateChallenge(validPublicKey);
      
      // Mock existing user found
      userRepository.findOne.mockResolvedValue(mockUser);

      // Mock Stellar signature verification
      jest.spyOn(StellarSdk, 'Keypair').mockImplementation({
        fromPublicKey: jest.fn().mockReturnValue({
          verify: jest.fn().mockReturnValue(true),
        }),
      } as any);

      const verifyDto: VerifySignatureDto = {
        challengeId: challenge.challengeId,
        publicKey: validPublicKey,
        signature: 'valid-signature',
      };

      const result = await service.verifySignature(verifyDto);

      expect(result.user).toEqual(mockUser);
      expect(userRepository.create).not.toHaveBeenCalled(); // Should not create new user
    });

    it('should reject invalid challenge', async () => {
      const verifyDto: VerifySignatureDto = {
        challengeId: 'non-existent-challenge',
        publicKey: validPublicKey,
        signature: 'signature',
      };

      await expect(service.verifySignature(verifyDto)).rejects.toThrow(
        'Invalid or expired challenge',
      );
    });

    it('should reject expired challenge', async () => {
      // Generate challenge with short expiration
      const challenge = await service.generateChallenge(validPublicKey);
      
      // Manually expire the challenge in Redis
      await authRedisService.deleteChallenge(challenge.challengeId);

      const verifyDto: VerifySignatureDto = {
        challengeId: challenge.challengeId,
        publicKey: validPublicKey,
        signature: 'signature',
      };

      await expect(service.verifySignature(verifyDto)).rejects.toThrow(
        'Invalid or expired challenge',
      );
    });

    it('should reject mismatched public key', async () => {
      const challenge = await service.generateChallenge(validPublicKey);
      
      const verifyDto: VerifySignatureDto = {
        challengeId: challenge.challengeId,
        publicKey: 'GDIFFERENT123456789012345678901234567890123456789',
        signature: 'signature',
      };

      await expect(service.verifySignature(verifyDto)).rejects.toThrow(
        'Public key does not match challenge',
      );
    });

    it('should reject invalid signature', async () => {
      const challenge = await service.generateChallenge(validPublicKey);
      
      // Mock Stellar signature verification failure
      jest.spyOn(StellarSdk, 'Keypair').mockImplementation({
        fromPublicKey: jest.fn().mockReturnValue({
          verify: jest.fn().mockReturnValue(false),
        }),
      } as any);

      const verifyDto: VerifySignatureDto = {
        challengeId: challenge.challengeId,
        publicKey: validPublicKey,
        signature: 'invalid-signature',
      };

      await expect(service.verifySignature(verifyDto)).rejects.toThrow(
        'Invalid signature',
      );
    });
  });

  describe('refreshAccessToken', () => {
    const userId = 'user-123';
    let validRefreshToken: string;

    beforeEach(() => {
      // Create a valid refresh token
      validRefreshToken = jwtService.sign(
        { sub: userId, tokenId: 'token-123' },
        { expiresIn: '7d' },
      );
    });

    it('should refresh access token with valid refresh token', async () => {
      // Store refresh token in Redis
      await authRedisService.setRefreshToken({ userId, tokenId: 'token-123' });
      
      // Mock user
      const mockUser = {
        id: userId,
        walletAddress: 'GTEST1234567890123456789012345678901234567890',
        username: 'testuser',
        email: 'test@example.com',
        isArtist: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.refreshAccessToken(validRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(jwtService.verify(result.accessToken).sub).toBe(userId);
    });

    it('should reject invalid refresh token format', async () => {
      const invalidToken = 'invalid-token-format';

      await expect(service.refreshAccessToken(invalidToken)).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should reject non-existent refresh token', async () => {
      await expect(service.refreshAccessToken(validRefreshToken)).rejects.toThrow(
        'Refresh token not found or invalid',
      );
    });

    it('should reject refresh token with wrong user', async () => {
      // Store refresh token with different user
      await authRedisService.setRefreshToken({ userId: 'different-user', tokenId: 'token-123' });

      await expect(service.refreshAccessToken(validRefreshToken)).rejects.toThrow(
        'Refresh token not found or invalid',
      );
    });

    it('should reject refresh token when user not found', async () => {
      // Store refresh token
      await authRedisService.setRefreshToken({ userId, tokenId: 'token-123' });
      
      // Mock user not found
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshAccessToken(validRefreshToken)).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('logout', () => {
    it('should invalidate refresh token', async () => {
      const refreshToken = jwtService.sign(
        { sub: 'user-123', tokenId: 'token-123' },
        { expiresIn: '7d' },
      );

      // Store refresh token first
      await authRedisService.setRefreshToken({ userId: 'user-123', tokenId: 'token-123' });

      // Verify token exists
      const beforeLogout = await authRedisService.getRefreshToken('token-123');
      expect(beforeLogout).toBeTruthy();

      await service.logout(refreshToken);

      // Verify token is deleted
      const afterLogout = await authRedisService.getRefreshToken('token-123');
      expect(afterLogout).toBeNull();
    });

    it('should handle logout with invalid token gracefully', async () => {
      const invalidToken = 'invalid-token';

      await expect(service.logout(invalidToken)).resolves.not.toThrow();
    });
  });

  describe('restart-safe behavior', () => {
    it('should survive service restart with active tokens', async () => {
      const userId = 'user-123';
      const publicKey = 'GTEST1234567890123456789012345678901234567890';

      // Simulate first service instance
      const challenge1 = await service.generateChallenge(publicKey);
      await authRedisService.setRefreshToken({ userId, tokenId: 'token-456' });

      // Simulate service restart
      await service.onModuleDestroy();
      await service.onModuleInit();

      // Verify challenge still exists in Redis
      const challengeAfterRestart = await authRedisService.getChallenge(challenge1.challengeId);
      expect(challengeAfterRestart).toBeTruthy();

      // Verify refresh token still exists in Redis
      const tokenAfterRestart = await authRedisService.getRefreshToken('token-456');
      expect(tokenAfterRestart).toBeTruthy();

      // Verify refresh still works after restart
      const refreshToken = jwtService.sign(
        { sub: userId, tokenId: 'token-456' },
        { expiresIn: '7d' },
      );

      const mockUser = {
        id: userId,
        walletAddress: publicKey,
        username: 'testuser',
        email: 'test@example.com',
        isArtist: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.refreshAccessToken(refreshToken);
      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('multi-instance support', () => {
    it('should support multiple service instances sharing Redis', async () => {
      // Create second service instance
      const service2 = module.create(AuthService);

      await service2.onModuleInit();

      const publicKey = 'GTEST1234567890123456789012345678901234567890';

      // Generate challenge in service 1
      const challengeFromService1 = await service.generateChallenge(publicKey);

      // Retrieve challenge in service 2
      const challengeInService2 = await authRedisService.getChallenge(challengeFromService1.challengeId);
      expect(challengeInService2).toBeTruthy();
      expect(challengeInService2.publicKey).toBe(publicKey);

      // Store refresh token in service 1
      await authRedisService.setRefreshToken({ userId: 'user-123', tokenId: 'token-shared' });

      // Validate refresh token in service 2
      const isValid = await authRedisService.validateRefreshToken('token-shared', 'user-123');
      expect(isValid).toBe(true);

      await service2.onModuleDestroy();
    });
  });

  describe('monitoring and health', () => {
    it('should provide accurate statistics', async () => {
      // Add some test data
      await authRedisService.setChallenge({
        challengeId: 'challenge-1',
        challenge: 'Test challenge',
        publicKey: 'GTEST1234567890123456789012345678901234567890',
        expiresAt: new Date(Date.now() + 300000),
      });

      await authRedisService.setRefreshToken({
        userId: 'user-123',
        tokenId: 'token-1',
      });

      const stats = await service.getStats();

      expect(stats.activeChallenges).toBe(1);
      expect(stats.activeRefreshTokens).toBe(1);
      expect(stats.redisHealthy).toBe(true);
    });
  });
});
