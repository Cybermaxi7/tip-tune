import { ApiProperty } from '@nestjs/swagger';

/**
 * Explanation metadata for why a recommendation was made
 */
export class RecommendationExplanationDto {
  @ApiProperty({
    description: 'Source of the recommendation',
    enum: ['popular', 'collaborative', 'content-based'],
    example: 'collaborative',
  })
  source: 'popular' | 'collaborative' | 'content-based';

  @ApiProperty({
    description: 'Human-readable explanation of why this item was recommended',
    example: 'Recommended because users with similar taste also enjoyed this track',
  })
  reason: string;

  @ApiProperty({
    description: 'Confidence score for this recommendation (1-100)',
    example: 85,
    minimum: 1,
    maximum: 100,
  })
  confidence: number;
}

/**
 * Track recommendation with explanation metadata
 */
export class TrackRecommendationDto {
  @ApiProperty({
    description: 'Unique track identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Track title',
    example: 'Midnight Dreams',
  })
  title: string;

  @ApiProperty({
    description: 'URL to the audio file',
    example: 'https://storage.example.com/tracks/audio.mp3',
  })
  audioUrl: string;

  @ApiProperty({
    description: 'URL to the cover art image',
    example: 'https://storage.example.com/covers/image.jpg',
    nullable: true,
  })
  coverArtUrl: string | null;

  @ApiProperty({
    description: 'Genre of the track',
    example: 'Afrobeats',
    nullable: true,
  })
  genre: string | null;

  @ApiProperty({
    description: 'Artist identifier',
    example: '660e8400-e29b-41d4-a716-446655440001',
    nullable: true,
  })
  artistId: string | null;

  @ApiProperty({
    description: 'Artist name',
    example: 'John Doe',
    nullable: true,
  })
  artistName: string | null;

  @ApiProperty({
    description: 'Recommendation score (higher is better)',
    example: 42,
  })
  score: number;

  @ApiProperty({
    description: 'Explanation of why this track was recommended',
    type: RecommendationExplanationDto,
  })
  explanation: RecommendationExplanationDto;
}

/**
 * Artist recommendation with explanation metadata
 */
export class ArtistRecommendationDto {
  @ApiProperty({
    description: 'Unique artist identifier',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  id: string;

  @ApiProperty({
    description: 'Artist name',
    example: 'Jane Smith',
  })
  artistName: string;

  @ApiProperty({
    description: 'Primary genre',
    example: 'Afrobeats',
    nullable: true,
  })
  genre: string | null;

  @ApiProperty({
    description: 'Recommendation score (higher is better)',
    example: 156,
  })
  score: number;

  @ApiProperty({
    description: 'Number of recommended tracks from this artist',
    example: 5,
  })
  trackCount: number;

  @ApiProperty({
    description: 'Explanation of why this artist was recommended',
    type: RecommendationExplanationDto,
  })
  explanation: RecommendationExplanationDto;
}

/**
 * Response wrapper for track recommendations
 */
export class TrackRecommendationsResponseDto {
  @ApiProperty({
    description: 'List of recommended tracks',
    type: [TrackRecommendationDto],
  })
  recommendations: TrackRecommendationDto[];

  @ApiProperty({
    description: 'Total number of recommendations returned',
    example: 20,
  })
  total: number;

  @ApiProperty({
    description: 'Timestamp when recommendations were generated',
    example: '2024-01-15T10:30:00Z',
  })
  generatedAt: string;
}

/**
 * Response wrapper for artist recommendations
 */
export class ArtistRecommendationsResponseDto {
  @ApiProperty({
    description: 'List of recommended artists',
    type: [ArtistRecommendationDto],
  })
  recommendations: ArtistRecommendationDto[];

  @ApiProperty({
    description: 'Total number of recommendations returned',
    example: 10,
  })
  total: number;

  @ApiProperty({
    description: 'Timestamp when recommendations were generated',
    example: '2024-01-15T10:30:00Z',
  })
  generatedAt: string;
}
