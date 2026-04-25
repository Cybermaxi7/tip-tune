import { Track, Artist } from '../types';
import { mockExploreAdapter as adapter } from './adapters/exploreAdapter';

export interface FeaturedArtist extends Artist {
  featuredTrack: Track;
  weeklyListeners: number;
}

export const exploreService = {
  fetchFeaturedArtist: async (): Promise<FeaturedArtist> => {
    const artists = await adapter.getArtists();
    const tracks = await adapter.getTracks();
    
    // Urban Symphony — highest tips in mock data
    const artist = artists.find(a => a.artistName === 'Urban Symphony') || artists[0];
    const featuredTrack = tracks.find((t) => t.artist.id === artist.id) || tracks[0];
    
    return {
      ...artist,
      featuredTrack,
      weeklyListeners: 45200,
    };
  },

  fetchTrendingTracks: async (): Promise<Track[]> => {
    const tracks = await adapter.getTracks();
    // Trending = weighted by plays + tips
    return [...tracks].sort((a, b) => b.plays + b.tips * 10 - (a.plays + a.tips * 10));
  },

  fetchNewReleases: async (): Promise<Track[]> => {
    const tracks = await adapter.getTracks();
    return [...tracks].sort(
      (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
  },

  fetchTopArtists: async (): Promise<Artist[]> => {
    const artists = await adapter.getArtists();
    return [...artists].sort(
      (a, b) => parseFloat(b.totalTipsReceived || '0') - parseFloat(a.totalTipsReceived || '0')
    );
  },

  fetchRecentlyTipped: async (): Promise<Track[]> => {
    const tracks = await adapter.getTracks();
    return [...tracks].sort((a, b) => b.tips - a.tips).slice(0, 8);
  },

  fetchGenres: () => {
    return adapter.getGenres();
  },

  fetchTracksByGenre: async (
    genre: string,
    sortBy: 'popularity' | 'recency' = 'popularity'
  ): Promise<Track[]> => {
    const tracks = await adapter.getTracks();
    let filtered = tracks.filter(
      (t) => t.genre?.toLowerCase() === genre.toLowerCase()
    );
    
    if (sortBy === 'popularity') {
      filtered.sort((a, b) => b.plays - a.plays);
    } else {
      filtered.sort(
        (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
      );
    }
    return filtered;
  },
};
