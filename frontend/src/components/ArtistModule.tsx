import React, { useEffect, useState } from "react";

/* =========================================================
   Types (Stable, Predictable Models)
========================================================= */

export type ArtistStats = {
  followers: number;
  following: number;
  posts: number;
  engagementRate: number;
  chart: { date: string; value: number }[];
};

export type ArtistProfile = {
  id: string;
  name: string;
  genre: string;
  bio: string;
  avatarUrl: string;
  isFollowing: boolean;
  stats: ArtistStats;
};

/* =========================================================
   Fixtures (Deterministic, No Randomness)
========================================================= */

const baseArtists = [
  {
    id: "artist-1",
    name: "Nova Kai",
    genre: "Afrobeats",
    bio: "Rhythm and soul from Lagos.",
    avatarUrl: "https://via.placeholder.com/100",
  },
  {
    id: "artist-2",
    name: "Echo Drift",
    genre: "Electronic",
    bio: "Synth-driven soundscapes.",
    avatarUrl: "https://via.placeholder.com/100",
  },
];

const generateStats = (seed: number): ArtistStats => {
  // deterministic values based on seed
  const followers = 1000 + seed * 137;
  const following = 200 + seed * 13;
  const posts = 50 + seed * 7;

  const chart = Array.from({ length: 7 }).map((_, i) => ({
    date: `2026-04-${10 + i}`,
    value: followers + i * (seed * 10),
  }));

  return {
    followers,
    following,
    posts,
    engagementRate: Number((0.05 + seed * 0.01).toFixed(2)),
    chart,
  };
};

export const artistFixtures: ArtistProfile[] = baseArtists.map(
  (artist, idx) => ({
    ...artist,
    isFollowing: false,
    stats: generateStats(idx + 1),
  })
);

/* =========================================================
   Service Interface
========================================================= */

export interface ArtistService {
  getArtist(id: string): Promise<ArtistProfile>;
  follow(id: string): Promise<ArtistProfile>;
  unfollow(id: string): Promise<ArtistProfile>;
}

/* =========================================================
   Mock Async Adapter (Deterministic)
========================================================= */

export class MockArtistService implements ArtistService {
  private state: Record<string, ArtistProfile> = {};

  constructor(initialData: ArtistProfile[]) {
    initialData.forEach((artist) => {
      this.state[artist.id] = { ...artist };
    });
  }

  async getArtist(id: string) {
    await this.delay();
    return { ...this.state[id] };
  }

  async follow(id: string) {
    await this.delay();
    const artist = this.state[id];
    if (!artist.isFollowing) {
      artist.isFollowing = true;
      artist.stats.followers += 1;
    }
    return { ...artist };
  }

  async unfollow(id: string) {
    await this.delay();
    const artist = this.state[id];
    if (artist.isFollowing) {
      artist.isFollowing = false;
      artist.stats.followers -= 1;
    }
    return { ...artist };
  }

  private delay() {
    return new Promise((r) => setTimeout(r, 150));
  }
}

/* =========================================================
   Component (Refactored)
========================================================= */

export const ArtistProfilePage: React.FC<{
  artistId: string;
  service?: ArtistService;
}> = ({ artistId, service }) => {
  const svc =
    service || new MockArtistService(artistFixtures);

  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await svc.getArtist(artistId);
    setArtist(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [artistId]);

  const handleFollowToggle = async () => {
    if (!artist) return;

    const updated = artist.isFollowing
      ? await svc.unfollow(artist.id)
      : await svc.follow(artist.id);

    setArtist(updated);
  };

  if (loading) return <p>Loading...</p>;
  if (!artist) return <p>Artist not found</p>;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <h2>{artist.name}</h2>
      <p>{artist.genre}</p>
      <p>{artist.bio}</p>

      <img src={artist.avatarUrl} alt={artist.name} />

      <div>
        <strong>Followers:</strong> {artist.stats.followers}
        <br />
        <strong>Following:</strong> {artist.stats.following}
        <br />
        <strong>Posts:</strong> {artist.stats.posts}
        <br />
        <strong>Engagement:</strong> {artist.stats.engagementRate}
      </div>

      <button onClick={handleFollowToggle}>
        {artist.isFollowing ? "Unfollow" : "Follow"}
      </button>

      {/* Chart Preview */}
      <h4>Growth (Last 7 days)</h4>
      <ul>
        {artist.stats.chart.map((point) => (
          <li key={point.date}>
            {point.date}: {point.value}
          </li>
        ))}
      </ul>
    </div>
  );
};