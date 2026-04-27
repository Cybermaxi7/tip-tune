import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RecommendationFeedback } from "./entities/recommendation-feedback.entity";
import { TrackRecommendationDto, ArtistRecommendationDto } from "./dto/recommendation-response.dto";

interface CacheEntry<T> {
  data: T[];
  expiresAt: number;
}

@Injectable()
export class RecommendationCacheService {
  private readonly logger = new Logger(RecommendationCacheService.name);
  private readonly cacheTtlMs = 3600000;
  private trackCache = new Map<string, CacheEntry<TrackRecommendationDto>>();
  private artistCache = new Map<string, CacheEntry<ArtistRecommendationDto>>();

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
  ): Promise<TrackRecommendationDto[] | null> {
    const cacheKey = this.getCacheKey(userId, 'track');
    const entry = this.trackCache.get(cacheKey);

    if (entry && entry.expiresAt > Date.now()) {
      this.logger.debug(`Track recommendations cache hit for user ${userId}`);
      return entry.data.slice(0, limit);
    }

    if (entry && entry.expiresAt <= Date.now()) {
      this.trackCache.delete(cacheKey);
    }

    return null;
  }

  async setTrackRecommendations(
    userId: string,
    recommendations: TrackRecommendationDto[],
  ): Promise<void> {
    const cacheKey = this.getCacheKey(userId, 'track');
    this.trackCache.set(cacheKey, {
      data: recommendations,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    this.logger.debug(`Track recommendations cached for user ${userId}`);
  }

  async getArtistRecommendations(userId: string): Promise<ArtistRecommendationDto[] | null> {
    const cacheKey = this.getCacheKey(userId, 'artist');
    const entry = this.artistCache.get(cacheKey);

    if (entry && entry.expiresAt > Date.now()) {
      this.logger.debug(`Artist recommendations cache hit for user ${userId}`);
      return entry.data;
    }

    if (entry && entry.expiresAt <= Date.now()) {
      this.artistCache.delete(cacheKey);
    }

    return null;
  }

  async setArtistRecommendations(
    userId: string,
    recommendations: ArtistRecommendationDto[],
  ): Promise<void> {
    const cacheKey = this.getCacheKey(userId, 'artist');
    this.artistCache.set(cacheKey, {
      data: recommendations,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    this.logger.debug(`Artist recommendations cached for user ${userId}`);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    this.trackCache.delete(this.getCacheKey(userId, 'track'));
    this.artistCache.delete(this.getCacheKey(userId, 'artist'));
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
