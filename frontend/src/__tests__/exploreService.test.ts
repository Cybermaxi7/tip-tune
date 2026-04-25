import { describe, it, expect, vi } from 'vitest';
import { exploreService } from '../services/exploreService';
import { mockTracks, mockArtists } from '../fixtures/explore.fixtures';

describe('exploreService', () => {
  it('should fetch featured artist based on specific mock criteria', async () => {
    const featured = await exploreService.fetchFeaturedArtist();
    expect(featured.artistName).toBe('Urban Symphony');
    expect(featured.featuredTrack.title).toBe('City Block');
    expect(featured.weeklyListeners).toBe(45200);
  });

  it('should order trending tracks by plays and tips weight', async () => {
    const trending = await exploreService.fetchTrendingTracks();
    
    // Manual calculation for top 2:
    // exp-10: 201500 + 2850*10 = 230000
    // exp-4: 156300 + 2100*10 = 177300
    expect(trending[0].id).toBe('exp-10');
    expect(trending[1].id).toBe('exp-4');
  });

  it('should filter tracks by genre accurately', async () => {
    const genre = 'Electronic';
    const electronicTracks = await exploreService.fetchTracksByGenre(genre);
    
    expect(electronicTracks.every(t => t.genre === genre)).toBe(true);
    expect(electronicTracks.length).toBe(2); // Neon Dreams, Stellar Drift
  });

  it('should sort genre tracks by popularity (plays)', async () => {
    const genre = 'Electronic';
    const sorted = await exploreService.fetchTracksByGenre(genre, 'popularity');
    
    // Neon Dreams: 120543, Stellar Drift: 78900
    expect(sorted[0].title).toBe('Neon Dreams');
    expect(sorted[1].title).toBe('Stellar Drift');
  });

  it('should sort top artists by total tips received', async () => {
    const topArtists = await exploreService.fetchTopArtists();
    
    // Urban Symphony: 15300.75, Luna Waves: 12450.50
    expect(topArtists[0].artistName).toBe('Urban Symphony');
    expect(topArtists[1].artistName).toBe('Luna Waves');
  });
});
