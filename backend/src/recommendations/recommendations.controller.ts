import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RecommendationsService } from "./recommendations.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  TrackRecommendationsResponseDto,
  ArtistRecommendationsResponseDto,
} from "./dto/recommendation-response.dto";

@ApiTags("Recommendations")
@Controller("recommendations")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  @Get("tracks")
  @ApiOperation({ summary: "Get personalized track recommendations" })
  @ApiResponse({
    status: 200,
    description: "Returns personalized track recommendations with explanations",
    type: TrackRecommendationsResponseDto,
  })
  async getTrackRecommendations(
    @CurrentUser("userId") userId: string,
    @Query("limit") limit?: string,
  ): Promise<TrackRecommendationsResponseDto> {
    return this.service.getTrackRecommendations(userId, Number(limit) || 20);
  }

  @Get("artists")
  @ApiOperation({ summary: "Get artist recommendations" })
  @ApiResponse({
    status: 200,
    description: "Returns artist recommendations with explanations",
    type: ArtistRecommendationsResponseDto,
  })
  async getArtistRecommendations(
    @CurrentUser("userId") userId: string,
  ): Promise<ArtistRecommendationsResponseDto> {
    return this.service.getArtistRecommendations(userId);
  }

  @Post("feedback")
  @ApiOperation({ summary: "Submit recommendation feedback (thumbs up/down)" })
  async submitFeedback(
    @CurrentUser("userId") userId: string,
    @Body() body: { trackId: string; feedback: "up" | "down" },
  ) {
    return this.service.recordFeedback(userId, body.trackId, body.feedback);
  }
}
