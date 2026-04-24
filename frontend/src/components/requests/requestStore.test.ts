import { describe, expect, it } from 'vitest';
import type { Track } from '@/types';
import { createRequestStore } from './requestStore';

const tracks: Track[] = [
  {
    id: 'track-1',
    title: 'Starlight',
    coverArt: 'cover-1',
    plays: 10,
    tips: 4,
    artist: { id: 'artist-1', artistName: 'Luna Waves' },
  },
  {
    id: 'track-2',
    title: 'Afterglow',
    coverArt: 'cover-2',
    plays: 12,
    tips: 8,
    artist: { id: 'artist-1', artistName: 'Luna Waves' },
  },
];

describe('requestStore', () => {
  it('enqueues requests and keeps higher tipped pending requests first', async () => {
    const store = createRequestStore({ artistId: 'artist-1', tracks });

    await store.enqueue({ trackId: 'track-1', tipAmount: 5, assetCode: 'XLM' });
    await store.enqueue({ trackId: 'track-2', tipAmount: 25, assetCode: 'USDC' });

    const snapshot = store.getSnapshot();
    expect(snapshot.requests.map((request) => request.trackId)).toEqual(['track-2', 'track-1']);
    expect(snapshot.counts.pending).toBe(2);
  });

  it('blocks duplicate pending requests for the same fan and track', async () => {
    const store = createRequestStore({ artistId: 'artist-1', tracks });

    await store.enqueue({ trackId: 'track-1', tipAmount: 5, assetCode: 'XLM' });
    const duplicateResult = await store.enqueue({ trackId: 'track-1', tipAmount: 10, assetCode: 'XLM' });

    const snapshot = store.getSnapshot();
    expect(duplicateResult).toBe(false);
    expect(snapshot.requests).toHaveLength(1);
    expect(snapshot.notification?.message).toMatch(/already requested this track/i);
  });

  it('updates request status and filters the visible queue', async () => {
    const store = createRequestStore({ artistId: 'artist-1', tracks });

    await store.enqueue({ trackId: 'track-1', tipAmount: 5, assetCode: 'XLM' });
    await store.enqueue({ trackId: 'track-2', tipAmount: 15, assetCode: 'USDC' });

    const [firstRequest] = store.getSnapshot().requests;
    await store.updateStatus(firstRequest.id, 'played');
    store.setFilter('played');

    const snapshot = store.getSnapshot();
    expect(snapshot.counts.played).toBe(1);
    expect(snapshot.visibleRequests).toHaveLength(1);
    expect(snapshot.visibleRequests[0]?.status).toBe('played');
  });
});
