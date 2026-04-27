import { Test, TestingModule } from "@nestjs/testing";
import { RecommendationsController } from "./recommendations.controller";
import { RecommendationsService } from "./recommendations.service";
import {
  TrackRecommendationsResponseDto,
  ArtistRecommendationsResponseDto,
} from "./dto/recommendation-response.dto";

describe("RecommendationsController", () => {
  let controller: RecommendationsController;
  let service: jest.Mocked<RecommendationsService>;

  beforeEach(async () => {
    const mockService = {
      getTrackRecommendations: jest.fn(),
      getArtistRecommendations: jest.fn(),
      recordFeedback: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        {
          provide: RecommendationsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<RecommendationsController>(
      RecommendationsController,
    );
    service = module.get(RecommendationsService) as jest.Mocked<
      RecommendationsService
    >;
  });

  describe("getTrackRecommendations", () => {
    it("returns typed track recommendations response", async () => {
      const mockResponse: TrackRecommendationsResponseDto = {
        recommendations: [
          {
            id: "track-1",
            title: "Test Track",
            audioUrl: "https://example.com/audio.mp3",
            coverArtUrl: "https://example.com/cover.jpg",
            genre: "Afrobeats",
            artistId: "artist-1",
            artistName: "Test Artist",
            score: 42,
            explanation: {
              source: "collaborative",
              reason:
                "Recommended because users with similar taste also enjoyed this track",
              confidence: 85,
            },
          },
        ],
        total: 1,
        generatedAt: "2024-01-15T10:30:00Z",
      };

      service.getTrackRecommendations.mockResolvedValue(mockResponse);

      const result = await controller.getTrackRecommendations("user-1", "20");

      expect(result).toEqual(mockResponse);
      expect(result.recommendations[0]).toHaveProperty("explanation");
      expect(result.recommendations[0].explanation).toHaveProperty("source");
      expect(result.recommendations[0].explanation).toHaveProperty("reason");
      expect(result.recommendations[0].explanation).toHaveProperty("confidence");
      expect(service.getTrackRecommendations).toHaveBeenCalledWith(
        "user-1",
        20,
      );
    });

    it("uses default limit when not provided", async () => {
      const mockResponse: TrackRecommendationsResponseDto = {
        recommendations: [],
        total: 0,
        generatedAt: "2024-01-15T10:30:00Z",
      };

      service.getTrackRecommendations.mockResolvedValue(mockResponse);

      await controller.getTrackRecommendations("user-1");

      expect(service.getTrackRecommendations).toHaveBeenCalledWith(
        "user-1",
        20,
      );
    });

    it("validates response shape matches DTO contract", async () => {
      const mockResponse: TrackRecommendationsResponseDto = {
        recommendations: [
          {
            id: "track-1",
            title: "Track",
            audioUrl: "url",
            coverArtUrl: null,
            genre: null,
            artistId: null,
            artistName: null,
            score: 10,
            explanation: {
              source: "popular",
              reason: "Trending track popular among all users",
              confidence: 10,
            },
          },
        ],
        total: 1,
        generatedAt: "2024-01-15T10:30:00Z",
      };

      service.getTrackRecommendations.mockResolvedValue(mockResponse);

      const result = await controller.getTrackRecommendations("user-1");

      // Validate response structure
      expect(result).toHaveProperty("recommendations");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("generatedAt");
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(typeof result.generatedAt).toBe("string");
    });
  });

  describe("getArtistRecommendations", () => {
    it("returns typed artist recommendations response", async () => {
      const mockResponse: ArtistRecommendationsResponseDto = {
        recommendations: [
          {
            id: "artist-1",
            artistName: "Test Artist",
            genre: "Afrobeats",
            score: 156,
            trackCount: 5,
            explanation: {
              source: "content-based",
              reason: "Matches your preferred genres and listening patterns",
              confidence: 100,
            },
          },
        ],
        total: 1,
        generatedAt: "2024-01-15T10:30:00Z",
      };

      service.getArtistRecommendations.mockResolvedValue(mockResponse);

      const result = await controller.getArtistRecommendations("user-1");

      expect(result).toEqual(mockResponse);
      expect(result.recommendations[0]).toHaveProperty("explanation");
      expect(result.recommendations[0].explanation).toHaveProperty("source");
      expect(result.recommendations[0].explanation).toHaveProperty("reason");
      expect(result.recommendations[0].explanation).toHaveProperty("confidence");
      expect(service.getArtistRecommendations).toHaveBeenCalledWith("user-1");
    });

    it("validates response shape matches DTO contract", async () => {
      const mockResponse: ArtistRecommendationsResponseDto = {
        recommendations: [
          {
            id: "artist-1",
            artistName: "Artist",
            genre: null,
            score: 50,
            trackCount: 3,
            explanation: {
              source: "content-based",
              reason: "Matches your preferred genres and listening patterns",
              confidence: 50,
            },
          },
        ],
        total: 1,
        generatedAt: "2024-01-15T10:30:00Z",
      };

      service.getArtistRecommendations.mockResolvedValue(mockResponse);

      const result = await controller.getArtistRecommendations("user-1");

      // Validate response structure
      expect(result).toHaveProperty("recommendations");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("generatedAt");
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(typeof result.generatedAt).toBe("string");
    });
  });

  describe("submitFeedback", () => {
    it("records feedback and returns result", async () => {
      const mockFeedback = {
        id: "feedback-1",
        userId: "user-1",
        trackId: "track-1",
        feedback: "up" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      service.recordFeedback.mockResolvedValue(mockFeedback as any);

      const result = await controller.submitFeedback("user-1", {
        trackId: "track-1",
        feedback: "up",
      });

      expect(result).toEqual(mockFeedback);
      expect(service.recordFeedback).toHaveBeenCalledWith(
        "user-1",
        "track-1",
        "up",
      );
    });
  });

  describe("explanation fields validation", () => {
    it("ensures all recommendation sources are properly typed", async () => {
      const sources: Array<"popular" | "collaborative" | "content-based"> = [
        "popular",
        "collaborative",
        "content-based",
      ];

      for (const source of sources) {
        const mockResponse: TrackRecommendationsResponseDto = {
          recommendations: [
            {
              id: "track-1",
              title: "Track",
              audioUrl: "url",
              coverArtUrl: null,
              genre: null,
              artistId: null,
              artistName: null,
              score: 10,
              explanation: {
                source,
                reason: "Test reason",
                confidence: 50,
              },
            },
          ],
          total: 1,
          generatedAt: "2024-01-15T10:30:00Z",
        };

        service.getTrackRecommendations.mockResolvedValue(mockResponse);

        const result = await controller.getTrackRecommendations("user-1");

        expect(result.recommendations[0].explanation.source).toBe(source);
      }
    });

    it("ensures confidence is within valid range", async () => {
      const mockResponse: TrackRecommendationsResponseDto = {
        recommendations: [
          {
            id: "track-1",
            title: "Track",
            audioUrl: "url",
            coverArtUrl: null,
            genre: null,
            artistId: null,
            artistName: null,
            score: 10,
            explanation: {
              source: "popular",
              reason: "Test",
              confidence: 75,
            },
          },
        ],
        total: 1,
        generatedAt: "2024-01-15T10:30:00Z",
      };

      service.getTrackRecommendations.mockResolvedValue(mockResponse);

      const result = await controller.getTrackRecommendations("user-1");

      const confidence = result.recommendations[0].explanation.confidence;
      expect(confidence).toBeGreaterThanOrEqual(1);
      expect(confidence).toBeLessThanOrEqual(100);
    });
  });
});
