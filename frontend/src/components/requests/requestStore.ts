import { useSyncExternalStore } from 'react';
import type { Track } from '@/types';
import type { RequestStatus, SongRequest } from './types';

export type RequestQueueFilter = 'all' | RequestStatus;

export interface CreateRequestInput {
  trackId: string;
  tipAmount: number;
  assetCode: 'XLM' | 'USDC';
  message?: string;
  fanName?: string;
}

export interface RequestStoreNotification {
  id: string;
  message: string;
  type: 'success' | 'info';
}

export interface RequestStoreSnapshot {
  filter: RequestQueueFilter;
  isSubmitting: boolean;
  notification: RequestStoreNotification | null;
  requests: SongRequest[];
  visibleRequests: SongRequest[];
  counts: Record<RequestQueueFilter, number>;
}

interface RequestTransport {
  enqueue: (input: CreateRequestInput) => Promise<SongRequest>;
  updateStatus: (request: SongRequest, status: Exclude<RequestStatus, 'expired'>) => Promise<SongRequest>;
}

interface RequestStoreOptions {
  tracks: Track[];
  artistId: string;
  fanName?: string;
}

const REQUEST_STATUS_PRIORITY: Record<RequestStatus, number> = {
  pending: 0,
  accepted: 1,
  played: 2,
  declined: 3,
  expired: 4,
};

export const sortRequests = (requests: SongRequest[]): SongRequest[] =>
  [...requests].sort((left, right) => {
    const statusPriority =
      REQUEST_STATUS_PRIORITY[left.status] - REQUEST_STATUS_PRIORITY[right.status];
    if (statusPriority !== 0) {
      return statusPriority;
    }

    if (left.tipAmount !== right.tipAmount) {
      return right.tipAmount - left.tipAmount;
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });

const buildCounts = (requests: SongRequest[]): Record<RequestQueueFilter, number> => ({
  all: requests.length,
  pending: requests.filter((request) => request.status === 'pending').length,
  accepted: requests.filter((request) => request.status === 'accepted').length,
  declined: requests.filter((request) => request.status === 'declined').length,
  played: requests.filter((request) => request.status === 'played').length,
  expired: requests.filter((request) => request.status === 'expired').length,
});

const filterRequests = (requests: SongRequest[], filter: RequestQueueFilter): SongRequest[] => {
  if (filter === 'all') {
    return requests;
  }

  return requests.filter((request) => request.status === filter);
};

const createMockRequestTransport = ({
  tracks,
  artistId,
  fanName = 'You',
}: RequestStoreOptions): RequestTransport => {
  let nextSequence = 0;
  const trackMap = new Map(tracks.map((track) => [track.id, track]));

  return {
    enqueue: async (input) => {
      const track = trackMap.get(input.trackId);
      if (!track) {
        throw new Error('Track unavailable for requests.');
      }

      const createdAt = new Date(Date.UTC(2026, 0, 1, 12, 0, nextSequence)).toISOString();
      const expiresAt = new Date(Date.UTC(2026, 0, 1, 13, 0, nextSequence)).toISOString();
      nextSequence += 1;

      return {
        id: `${artistId}-request-${nextSequence}`,
        trackId: input.trackId,
        trackTitle: track.title,
        tipAmount: input.tipAmount,
        assetCode: input.assetCode,
        fanName: input.fanName ?? fanName,
        message: input.message,
        createdAt,
        expiresAt,
        status: 'pending',
      };
    },
    updateStatus: async (request, status) => ({
      ...request,
      status,
    }),
  };
};

class RequestStore {
  private readonly transport: RequestTransport;

  private readonly fanName: string;

  private readonly listeners = new Set<() => void>();

  private state: RequestStoreSnapshot = {
    filter: 'all',
    isSubmitting: false,
    notification: null,
    requests: [],
    visibleRequests: [],
    counts: buildCounts([]),
  };

  constructor(options: RequestStoreOptions) {
    this.transport = createMockRequestTransport(options);
    this.fanName = options.fanName ?? 'You';
    this.recompute();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  private emit = () => {
    this.listeners.forEach((listener) => listener());
  };

  private setState = (
    updater:
      | Partial<RequestStoreSnapshot>
      | ((current: RequestStoreSnapshot) => Partial<RequestStoreSnapshot>)
  ) => {
    const patch = typeof updater === 'function' ? updater(this.state) : updater;
    this.state = {
      ...this.state,
      ...patch,
    };
    this.recompute();
    this.emit();
  };

  private recompute() {
    const requests = sortRequests(this.state.requests);
    this.state = {
      ...this.state,
      requests,
      visibleRequests: filterRequests(requests, this.state.filter),
      counts: buildCounts(requests),
    };
  }

  setFilter = (filter: RequestQueueFilter) => {
    this.setState({ filter });
  };

  dismissNotification = () => {
    this.setState({ notification: null });
  };

  enqueue = async (input: CreateRequestInput) => {
    const normalizedFanName = input.fanName ?? this.fanName;
    const normalizedMessage = input.message?.trim() || undefined;
    const hasDuplicate = this.state.requests.some(
      (request) =>
        request.trackId === input.trackId &&
        request.fanName === normalizedFanName &&
        request.status === 'pending'
    );

    if (hasDuplicate) {
      this.setState({
        notification: {
          id: `notification-${Date.now()}`,
          message: 'You have already requested this track. Please wait for the artist.',
          type: 'info',
        },
      });
      return false;
    }

    this.setState({ isSubmitting: true });

    try {
      const createdRequest = await this.transport.enqueue({
        ...input,
        fanName: normalizedFanName,
        message: normalizedMessage,
      });

      this.setState((current) => ({
        isSubmitting: false,
        requests: [createdRequest, ...current.requests],
        filter: current.filter === 'expired' ? 'all' : current.filter,
        notification: {
          id: `notification-${Date.now()}`,
          message: 'Song request sent! Higher tips move you up the queue.',
          type: 'success',
        },
      }));
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create song request right now.';
      this.setState({
        isSubmitting: false,
        notification: {
          id: `notification-${Date.now()}`,
          message,
          type: 'info',
        },
      });
      return false;
    }
  };

  updateStatus = async (id: string, status: Exclude<RequestStatus, 'expired'>) => {
    const request = this.state.requests.find((candidate) => candidate.id === id);
    if (!request) {
      return;
    }

    const updatedRequest = await this.transport.updateStatus(request, status);
    const messageByStatus: Record<Exclude<RequestStatus, 'expired'>, string> = {
      pending: 'Request moved back to pending.',
      accepted: 'Request accepted and kept in the queue.',
      declined: 'Request declined.',
      played: 'Fan has been notified that their request was played.',
    };

    this.setState((current) => ({
      requests: current.requests.map((candidate) =>
        candidate.id === id ? updatedRequest : candidate
      ),
      notification: {
        id: `notification-${Date.now()}`,
        message: messageByStatus[status],
        type: status === 'accepted' || status === 'played' ? 'success' : 'info',
      },
    }));
  };
}

export const createRequestStore = (options: RequestStoreOptions) => new RequestStore(options);

export const useRequestStore = (store: RequestStore): RequestStoreSnapshot =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
