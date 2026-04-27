import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AuthSession } from '../entities/auth-session.entity';

interface ChallengeData {
  challengeId: string;
  challenge: string;
  publicKey: string;
  expiresAt: Date;
}

interface RefreshTokenData {
  userId: string;
  tokenId: string;
}

@Injectable()
export class AuthRedisService {
  private readonly logger = new Logger(AuthRedisService.name);
  private readonly redis: Redis;
  private readonly challengePrefix = 'auth:challenge:';
  private readonly refreshTokenPrefix = 'auth:refresh:';
  private readonly challengeTTL = 5 * 60; // 5 minutes
  private readonly refreshTokenTTL = 7 * 24 * 60 * 60; // 7 days

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis for auth session storage');
    });
  }

  /**
   * Store challenge data with TTL
   */
  async setChallenge(challengeData: ChallengeData): Promise<void> {
    const key = this.challengePrefix + challengeData.challengeId;
    const ttlSeconds = Math.floor(
      (challengeData.expiresAt.getTime() - Date.now()) / 1000,
    );

    await this.redis.setex(key, ttlSeconds, JSON.stringify(challengeData));
    this.logger.debug(`Stored challenge: ${challengeData.challengeId}`);
  }

  /**
   * Retrieve challenge data
   */
  async getChallenge(challengeId: string): Promise<ChallengeData | null> {
    const key = this.challengePrefix + challengeId;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      const challengeData = JSON.parse(data) as ChallengeData;
      
      // Check if expired (additional safety check)
      if (new Date() > new Date(challengeData.expiresAt)) {
        await this.deleteChallenge(challengeId);
        return null;
      }

      return challengeData;
    } catch (error) {
      this.logger.error(`Failed to parse challenge data: ${error.message}`);
      await this.deleteChallenge(challengeId);
      return null;
    }
  }

  /**
   * Delete challenge data
   */
  async deleteChallenge(challengeId: string): Promise<void> {
    const key = this.challengePrefix + challengeId;
    await this.redis.del(key);
    this.logger.debug(`Deleted challenge: ${challengeId}`);
  }

  /**
   * Store refresh token data with TTL
   */
  async setRefreshToken(tokenData: RefreshTokenData): Promise<void> {
    const key = this.refreshTokenPrefix + tokenData.tokenId;
    await this.redis.setex(key, this.refreshTokenTTL, JSON.stringify(tokenData));
    this.logger.debug(`Stored refresh token: ${tokenData.tokenId}`);
  }

  /**
   * Retrieve refresh token data
   */
  async getRefreshToken(tokenId: string): Promise<RefreshTokenData | null> {
    const key = this.refreshTokenPrefix + tokenId;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as RefreshTokenData;
    } catch (error) {
      this.logger.error(`Failed to parse refresh token data: ${error.message}`);
      await this.deleteRefreshToken(tokenId);
      return null;
    }
  }

  /**
   * Delete refresh token data
   */
  async deleteRefreshToken(tokenId: string): Promise<void> {
    const key = this.refreshTokenPrefix + tokenId;
    await this.redis.del(key);
    this.logger.debug(`Deleted refresh token: ${tokenId}`);
  }

  /**
   * Check if refresh token exists and is valid for user
   */
  async validateRefreshToken(tokenId: string, userId: string): Promise<boolean> {
    const tokenData = await this.getRefreshToken(tokenId);
    return tokenData !== null && tokenData.userId === userId;
  }

  /**
   * Clean up expired challenges (called periodically)
   */
  async cleanupExpiredChallenges(): Promise<number> {
    const pattern = this.challengePrefix + '*';
    const keys = await this.redis.keys(pattern);
    let cleaned = 0;

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        try {
          const challengeData = JSON.parse(data) as ChallengeData;
          if (new Date() > new Date(challengeData.expiresAt)) {
            await this.redis.del(key);
            cleaned++;
          }
        } catch (error) {
          // Remove malformed data
          await this.redis.del(key);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired challenges`);
    }

    return cleaned;
  }

  /**
   * Get statistics for monitoring
   */
  async getStats(): Promise<{
    activeChallenges: number;
    activeRefreshTokens: number;
  }> {
    const [challengeKeys, refreshKeys] = await Promise.all([
      this.redis.keys(this.challengePrefix + '*'),
      this.redis.keys(this.refreshTokenPrefix + '*'),
    ]);

    return {
      activeChallenges: challengeKeys.length,
      activeRefreshTokens: refreshKeys.length,
    };
  }

  /**
   * Health check for Redis connection
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
    this.logger.log('Disconnected from Redis');
  }
}
