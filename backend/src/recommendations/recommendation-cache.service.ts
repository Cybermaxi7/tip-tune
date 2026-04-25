import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RecommendationFeedback } from "./entities/recommendation-feedback.entity";

interface CacheEntry {
  data: any[];
  expiresAt: number;
}

@Injectable()
export class RecommendationCacheService {
  private readonly logger = new Logger(RecommendationCacheService.name);
  private readonly cacheTtlMs = 3600000;
  private cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(RecommendationFeedback)
    private readonly feedbackRepo: Repository<RecommendationFeedback>,
  ) {}

  getCacheKey(userId: string, type: 'track' | 'artist'): string {
    return `recommendations:${type}:${userId}`;
  }

  async getTrackRecommendations(
    userId: string,
    limit: number = 20,
  ): Promise<any[] | null> {
    const cacheKey = this.getCacheKey(userId, 'track');
    const entry = this.cache.get(cacheKey);

    if (entry && entry.expiresAt > Date.now()) {
      this.logger.debug(`Track recommendations cache hit for user ${userId}`);
      return entry.data.slice(0, limit);
    }

    if (entry && entry.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
    }

    return null;
  }

  async setTrackRecommendations(
    userId: string,
    recommendations: any[],
  ): Promise<void> {
    const cacheKey = this.getCacheKey(userId, 'track');
    this.cache.set(cacheKey, {
      data: recommendations,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    this.logger.debug(`Track recommendations cached for user ${userId}`);
  }

  async getArtistRecommendations(userId: string): Promise<any[] | null> {
    const cacheKey = this.getCacheKey(userId, 'artist');
    const entry = this.cache.get(cacheKey);

    if (entry && entry.expiresAt > Date.now()) {
      this.logger.debug(`Artist recommendations cache hit for user ${userId}`);
      return entry.data;
    }

    if (entry && entry.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
    }

    return null;
  }

  async setArtistRecommendations(
    userId: string,
    recommendations: any[],
  ): Promise<void> {
    const cacheKey = this.getCacheKey(userId, 'artist');
    this.cache.set(cacheKey, {
      data: recommendations,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    this.logger.debug(`Artist recommendations cached for user ${userId}`);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    this.cache.delete(this.getCacheKey(userId, 'track'));
    this.cache.delete(this.getCacheKey(userId, 'artist'));
    this.logger.debug(`Invalidated recommendation cache for user ${userId}`);
  }

  async recordFeedback(
    userId: string,
    trackId: string,
    feedback: 'up' | 'down',
  ): Promise<RecommendationFeedback> {
    const existing = await this.feedbackRepo.findOne({
      where: { userId, trackId },
    });

    const entry = existing || this.feedbackRepo.create({ userId, trackId });
    entry.feedback = feedback;
    const saved = await this.feedbackRepo.save(entry);

    await this.invalidateUserCache(userId);

    return saved;
  }

  async invalidateOnTipEvent(userId: string): Promise<void> {
    await this.invalidateUserCache(userId);
    this.logger.debug(`Invalidated cache due to tip event for user ${userId}`);
  }

  async invalidateOnFeedbackEvent(userId: string): Promise<void> {
    await this.invalidateUserCache(userId);
    this.logger.debug(`Invalidated cache due to feedback event for user ${userId}`);
  }
}
