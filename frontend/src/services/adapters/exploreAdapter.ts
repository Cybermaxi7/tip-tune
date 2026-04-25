import { Track, Artist } from '../../types';
import { mockArtists, mockTracks, GENRES, GENRE_COLORS, MOCK_DELAY } from '../../fixtures/explore.fixtures';

export interface ExploreAdapter {
  getArtists(): Promise<Artist[]>;
  getTracks(): Promise<Track[]>;
  getGenres(): Promise<{ name: string; gradient: string }[]>;
}

export const mockExploreAdapter: ExploreAdapter = {
  getArtists: () => {
    return new Promise((resolve) =>
      setTimeout(() => resolve([...mockArtists]), MOCK_DELAY)
    );
  },
  getTracks: () => {
    return new Promise((resolve) =>
      setTimeout(() => resolve([...mockTracks]), MOCK_DELAY)
    );
  },
  getGenres: () => {
    return new Promise((resolve) =>
      setTimeout(() =>
        resolve(
          GENRES.map((name) => ({
            name,
            gradient: GENRE_COLORS[name] || 'from-gray-400 to-gray-700',
          }))
        ),
        MOCK_DELAY / 2
      )
    );
  },
};
