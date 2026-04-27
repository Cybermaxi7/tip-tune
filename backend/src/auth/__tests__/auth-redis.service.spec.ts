import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthRedisService } from '../services/auth-redis.service';
import Redis from 'ioredis';

describe('AuthRedisService', () => {
  let service: AuthRedisService;
  let redis: Redis;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: undefined,
        REDIS_DB: 0,
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthRedisService>(AuthRedisService);
    configService = module.get<ConfigService>(ConfigService);
    
    // Get the Redis instance for testing
    redis = (service as any).redis;
    
    // Clear all test data before each test
    await redis.flushall();
  });

  afterEach(async () => {
    // Clean up after each test
    await redis.flushall();
  });

  afterAll(async () => {
    await service.disconnect();
  });

  describe('setChallenge and getChallenge', () => {
    const challengeData = {
      challengeId: 'test-challenge-id',
      challenge: 'Test challenge message',
      publicKey: 'GTEST1234567890123456789012345678901234567890',
      expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
    };

    it('should store and retrieve challenge data', async () => {
      await service.setChallenge(challengeData);
      
      const result = await service.getChallenge(challengeData.challengeId);
      
      expect(result).toEqual(challengeData);
    });

    it('should return null for non-existent challenge', async () => {
      const result = await service.getChallenge('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return null for expired challenge', async () => {
      const expiredChallenge = {
        ...challengeData,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      await service.setChallenge(expiredChallenge);
      
      const result = await service.getChallenge(expiredChallenge.challengeId);
      expect(result).toBeNull();
    });

    it('should handle malformed challenge data gracefully', async () => {
      // Directly set malformed data in Redis
      const key = 'auth:challenge:malformed';
      await redis.set(key, 'invalid-json');
      
      const result = await service.getChallenge('malformed');
      expect(result).toBeNull();
    });
  });

  describe('deleteChallenge', () => {
    const challengeData = {
      challengeId: 'test-challenge-id',
      challenge: 'Test challenge message',
      publicKey: 'GTEST1234567890123456789012345678901234567890',
      expiresAt: new Date(Date.now() + 300000),
    };

    it('should delete challenge data', async () => {
      await service.setChallenge(challengeData);
      
      // Verify it exists
      const beforeDelete = await service.getChallenge(challengeData.challengeId);
      expect(beforeDelete).toEqual(challengeData);
      
      // Delete it
      await service.deleteChallenge(challengeData.challengeId);
      
      // Verify it's gone
      const afterDelete = await service.getChallenge(challengeData.challengeId);
      expect(afterDelete).toBeNull();
    });

    it('should handle deletion of non-existent challenge', async () => {
      await expect(service.deleteChallenge('non-existent')).resolves.not.toThrow();
    });
  });

  describe('setRefreshToken and getRefreshToken', () => {
    const tokenData = {
      userId: 'user-123',
      tokenId: 'token-456',
    };

    it('should store and retrieve refresh token data', async () => {
      await service.setRefreshToken(tokenData);
      
      const result = await service.getRefreshToken(tokenData.tokenId);
      
      expect(result).toEqual(tokenData);
    });

    it('should return null for non-existent refresh token', async () => {
      const result = await service.getRefreshToken('non-existent-token');
      expect(result).toBeNull();
    });

    it('should handle malformed refresh token data gracefully', async () => {
      // Directly set malformed data in Redis
      const key = 'auth:refresh:malformed';
      await redis.set(key, 'invalid-json');
      
      const result = await service.getRefreshToken('malformed');
      expect(result).toBeNull();
    });
  });

  describe('deleteRefreshToken', () => {
    const tokenData = {
      userId: 'user-123',
      tokenId: 'token-456',
    };

    it('should delete refresh token data', async () => {
      await service.setRefreshToken(tokenData);
      
      // Verify it exists
      const beforeDelete = await service.getRefreshToken(tokenData.tokenId);
      expect(beforeDelete).toEqual(tokenData);
      
      // Delete it
      await service.deleteRefreshToken(tokenData.tokenId);
      
      // Verify it's gone
      const afterDelete = await service.getRefreshToken(tokenData.tokenId);
      expect(afterDelete).toBeNull();
    });

    it('should handle deletion of non-existent refresh token', async () => {
      await expect(service.deleteRefreshToken('non-existent')).resolves.not.toThrow();
    });
  });

  describe('validateRefreshToken', () => {
    const tokenData = {
      userId: 'user-123',
      tokenId: 'token-456',
    };

    it('should validate correct refresh token', async () => {
      await service.setRefreshToken(tokenData);
      
      const result = await service.validateRefreshToken(tokenData.tokenId, tokenData.userId);
      expect(result).toBe(true);
    });

    it('should reject refresh token with wrong user ID', async () => {
      await service.setRefreshToken(tokenData);
      
      const result = await service.validateRefreshToken(tokenData.tokenId, 'wrong-user');
      expect(result).toBe(false);
    });

    it('should reject non-existent refresh token', async () => {
      const result = await service.validateRefreshToken('non-existent', 'user-123');
      expect(result).toBe(false);
    });
  });

  describe('cleanupExpiredChallenges', () => {
    it('should clean up expired challenges', async () => {
      const validChallenge = {
        challengeId: 'valid-challenge',
        challenge: 'Valid challenge',
        publicKey: 'GTEST1234567890123456789012345678901234567890',
        expiresAt: new Date(Date.now() + 300000), // Valid
      };

      const expiredChallenge = {
        challengeId: 'expired-challenge',
        challenge: 'Expired challenge',
        publicKey: 'GTEST1234567890123456789012345678901234567890',
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      await service.setChallenge(validChallenge);
      await service.setChallenge(expiredChallenge);

      const cleaned = await service.cleanupExpiredChallenges();

      expect(cleaned).toBe(1);

      // Verify valid challenge still exists
      const validResult = await service.getChallenge('valid-challenge');
      expect(validResult).toEqual(validChallenge);

      // Verify expired challenge is gone
      const expiredResult = await service.getChallenge('expired-challenge');
      expect(expiredResult).toBeNull();
    });

    it('should return 0 when no expired challenges exist', async () => {
      const cleaned = await service.cleanupExpiredChallenges();
      expect(cleaned).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const challengeData = {
        challengeId: 'test-challenge-id',
        challenge: 'Test challenge message',
        publicKey: 'GTEST1234567890123456789012345678901234567890',
        expiresAt: new Date(Date.now() + 300000),
      };

      const tokenData = {
        userId: 'user-123',
        tokenId: 'token-456',
      };

      await service.setChallenge(challengeData);
      await service.setRefreshToken(tokenData);

      const stats = await service.getStats();

      expect(stats.activeChallenges).toBe(1);
      expect(stats.activeRefreshTokens).toBe(1);
    });

    it('should return zero stats when no data exists', async () => {
      const stats = await service.getStats();

      expect(stats.activeChallenges).toBe(0);
      expect(stats.activeRefreshTokens).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return true when Redis is connected', async () => {
      const result = await service.isHealthy();
      expect(result).toBe(true);
    });
  });

  describe('TTL behavior', () => {
    it('should set appropriate TTL for challenges', async () => {
      const challengeData = {
        challengeId: 'ttl-challenge',
        challenge: 'Test challenge',
        publicKey: 'GTEST1234567890123456789012345678901234567890',
        expiresAt: new Date(Date.now() + 300000), // 5 minutes
      };

      await service.setChallenge(challengeData);

      // Check TTL is set (should be around 300 seconds)
      const key = 'auth:challenge:ttl-challenge';
      const ttl = await redis.ttl(key);
      
      expect(ttl).toBeGreaterThan(250); // Allow some variance
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should set appropriate TTL for refresh tokens', async () => {
      const tokenData = {
        userId: 'user-123',
        tokenId: 'ttl-token',
      };

      await service.setRefreshToken(tokenData);

      // Check TTL is set (should be 7 days = 604800 seconds)
      const key = 'auth:refresh:ttl-token';
      const ttl = await redis.ttl(key);
      
      expect(ttl).toBeGreaterThan(600000); // Allow some variance
      expect(ttl).toBeLessThanOrEqual(604800);
    });
  });
});
