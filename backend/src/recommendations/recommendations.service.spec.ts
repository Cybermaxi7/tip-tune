import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RecommendationsService } from "./recommendations.service";
import { RecommendationFeedback } from "./entities/recommendation-feedback.entity";
import { RecommendationCacheService } from "./recommendation-cache.service";

describe("RecommendationsService", () => {
  let service: RecommendationsService;
  let feedbackRepo: jest.Mocked<any>;
  let dataSource: jest.Mocked<any>;
  let cacheService: jest.Mocked<RecommendationCacheService>;

  beforeEach(async () => {
    feedbackRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };

    dataSource = {
      query: jest.fn(),
    };

    cacheService = {
      getTrackRecommendations: jest.fn(),
      setTrackRecommendations: jest.fn(),
      getArtistRecommendations: jest.fn(),
      setArtistRecommendations: jest.fn(),
      recordFeedback: jest.fn(),
      invalidateUserCache: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        {
          provide: getRepositoryToken(RecommendationFeedback),
          useValue: feedbackRepo,
        },
        { provide: DataSource, useValue: dataSource },
        { provide: RecommendationCacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get(RecommendationsService);
  });

  describe("getTrackRecommendations", () => {
    it("uses popularity fallback for cold-start users and returns typed response", async () => {
      cacheService.getTrackRecommendations.mockResolvedValue(null);
      dataSource.query
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            id: "track-1",
            title: "Popular Track",
            audioUrl: "audio",
            coverArtUrl: "cover",
            genre: "Afrobeats",
            artistId: "artist-1",
            artistName: "Artist One",
            score: 9,
          },
        ]);

      const result = await service.getTrackRecommendations("user-1", 5);

      expect(result).toHaveProperty("recommendations");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("generatedAt");
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0]).toMatchObject({
        id: "track-1",
        title: "Popular Track",
        explanation: {
          source: "popular",
          reason: expect.any(String),
          confidence: expect.any(Number),
        },
      });
      expect(result.total).toBe(1);
    });

    it("merges collaborative and content-based recommendations for users with history", async () => {
      cacheService.getTrackRecommendations.mockResolvedValue(null);
      dataSource.query
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([
          {
            id: "track-1",
            title: "Collaborative Pick",
            audioUrl: "audio",
            coverArtUrl: "cover",
            genre: "Afrobeats",
            artistId: "artist-1",
            artistName: "Artist One",
            score: 12,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "track-2",
            title: "Content Pick",
            audioUrl: "audio",
            coverArtUrl: "cover",
            genre: "Afrobeats",
            artistId: "artist-2",
            artistName: "Artist Two",
            score: 7,
          },
        ]);

      const result = await service.getTrackRecommendations("user-1", 5);

      expect(result.recommendations.map((track) => track.id)).toEqual([
        "track-1",
        "track-2",
      ]);
      expect(result.recommendations[0].explanation.source).toBe("collaborative");
      expect(result.recommendations[1].explanation.source).toBe("content-based");
    });

    it("returns cached recommendations with proper response structure", async () => {
      const cachedTracks = [
        {
          id: "track-1",
          title: "Cached Track",
          audioUrl: "audio",
          coverArtUrl: "cover",
          genre: "Afrobeats",
          artistId: "artist-1",
          artistName: "Artist One",
          score: 10,
          explanation: {
            source: "popular" as const,
            reason: "Trending track popular among all users",
            confidence: 10,
          },
        },
      ];
      cacheService.getTrackRecommendations.mockResolvedValue(cachedTracks);

      const result = await service.getTrackRecommendations("user-1", 5);

      expect(result.recommendations).toEqual(cachedTracks);
      expect(result.total).toBe(1);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe("getArtistRecommendations", () => {
    it("returns typed artist recommendations with explanations", async () => {
      cacheService.getArtistRecommendations.mockResolvedValue(null);
      cacheService.getTrackRecommendations.mockResolvedValue(null);
      dataSource.query
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([
          {
            id: "track-1",
            title: "Track 1",
            audioUrl: "audio",
            coverArtUrl: "cover",
            genre: "Afrobeats",
            artistId: "artist-1",
            artistName: "Artist One",
            score: 12,
          },
          {
            id: "track-2",
            title: "Track 2",
            audioUrl: "audio",
            coverArtUrl: "cover",
            genre: "Afrobeats",
            artistId: "artist-1",
            artistName: "Artist One",
            score: 8,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getArtistRecommendations("user-1");

      expect(result).toHaveProperty("recommendations");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("generatedAt");
      expect(result.recommendations[0]).toMatchObject({
        id: "artist-1",
        artistName: "Artist One",
        trackCount: 2,
        explanation: {
          source: "content-based",
          reason: expect.any(String),
          confidence: expect.any(Number),
        },
      });
    });
  });

  describe("recordFeedback", () => {
    it("delegates to cache service for feedback recording", async () => {
      const mockFeedback = {
        id: "feedback-1",
        userId: "user-1",
        trackId: "track-1",
        feedback: "down" as const,
      };
      cacheService.recordFeedback.mockResolvedValue(mockFeedback as any);

      const result = await service.recordFeedback("user-1", "track-1", "down");

      expect(cacheService.recordFeedback).toHaveBeenCalledWith(
        "user-1",
        "track-1",
        "down",
      );
      expect(result).toEqual(mockFeedback);
    });
  });

  describe("explanation metadata", () => {
    it("includes proper explanation for popular recommendations", async () => {
      cacheService.getTrackRecommendations.mockResolvedValue(null);
      dataSource.query
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          {
            id: "track-1",
            title: "Popular Track",
            audioUrl: "audio",
            coverArtUrl: null,
            genre: null,
            artistId: null,
            artistName: null,
            score: 50,
          },
        ]);

      const result = await service.getTrackRecommendations("user-1", 5);

      expect(result.recommendations[0].explanation).toEqual({
        source: "popular",
        reason: "Trending track popular among all users",
        confidence: expect.any(Number),
      });
    });

    it("includes proper explanation for collaborative recommendations", async () => {
      cacheService.getTrackRecommendations.mockResolvedValue(null);
      dataSource.query
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([
          {
            id: "track-1",
            title: "Collab Track",
            audioUrl: "audio",
            coverArtUrl: null,
            genre: null,
            artistId: null,
            artistName: null,
            score: 30,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getTrackRecommendations("user-1", 5);

      expect(result.recommendations[0].explanation).toEqual({
        source: "collaborative",
        reason:
          "Recommended because users with similar taste also enjoyed this track",
        confidence: expect.any(Number),
      });
    });

    it("includes proper explanation for content-based recommendations", async () => {
      cacheService.getTrackRecommendations.mockResolvedValue(null);
      dataSource.query
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "track-1",
            title: "Content Track",
            audioUrl: "audio",
            coverArtUrl: null,
            genre: "Afrobeats",
            artistId: null,
            artistName: null,
            score: 20,
          },
        ]);

      const result = await service.getTrackRecommendations("user-1", 5);

      expect(result.recommendations[0].explanation).toEqual({
        source: "content-based",
        reason: "Matches your preferred genres and listening patterns",
        confidence: expect.any(Number),
      });
    });
  });
});
