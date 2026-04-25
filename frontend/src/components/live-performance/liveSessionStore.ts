import { compareLeaderboardEntries, getNextLeaderboardSortOrder } from '../../services/leaderboardService';
import { truncateAddress } from '../../utils/stellar';
import type { LeaderboardEntry, LiveSessionState, LiveTipEvent } from './types';

const LIVE_SESSION_STORAGE_KEY = 'tiptune.livePerformance.session.v1';
const LARGE_TIP_THRESHOLD_XLM = 25;
const MAX_ALERTS = 6;
const HYPE_DECAY_STEP = 3;

export interface TipNotificationPayload {
  type?: string;
  data?: {
    tipId?: string;
    amount?: number;
    asset?: string;
    senderAddress?: string;
    isAnonymous?: boolean;
    createdAt?: string | Date;
  };
}

interface BurstTip {
  alert: LiveTipEvent;
  supporterId: string;
  hypeBoost: number;
  xlmAmount: number;
}

export interface LiveSessionStoreSnapshot extends LiveSessionState {
  lastTipAt: string | null;
  queuedTipCount: number;
  nextTipId: number;
}

export interface LiveSessionStoreFlushResult {
  hasLargeTip: boolean;
  lastTipAt: string | null;
}

type SnapshotPatch = Partial<Omit<LiveSessionStoreSnapshot, 'alerts' | 'leaderboard'>> & {
  alerts?: LiveTipEvent[];
  leaderboard?: LeaderboardEntry[];
};

const createDefaultSnapshot = (): LiveSessionStoreSnapshot => ({
  artistId: '',
  isSessionActive: false,
  privacyMode: false,
  sessionStartedAt: null,
  sessionTotalXlm: 0,
  tipCount: 0,
  hypeScore: 0,
  alerts: [],
  leaderboard: [],
  lastTipAt: null,
  queuedTipCount: 0,
  nextTipId: 0,
});

const sanitizeAlerts = (entries: unknown): LiveTipEvent[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry, index) => {
    const candidate = entry as Partial<LiveTipEvent>;
    if (typeof candidate.amount !== 'number' || typeof candidate.tipperName !== 'string') {
      return [];
    }

    return [
      {
        id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `alert-${index}`,
        tipperName: candidate.tipperName,
        amount: candidate.amount,
        asset: typeof candidate.asset === 'string' && candidate.asset.trim() ? candidate.asset : 'XLM',
        createdAt:
          typeof candidate.createdAt === 'string' && candidate.createdAt.trim()
            ? candidate.createdAt
            : new Date().toISOString(),
        isLargeTip: Boolean(candidate.isLargeTip),
      },
    ];
  });
};

const sanitizeLeaderboard = (entries: unknown): LeaderboardEntry[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry, index) => {
    const candidate = entry as Partial<LeaderboardEntry>;
    const tipperName =
      typeof candidate.tipperName === 'string' && candidate.tipperName.trim()
        ? candidate.tipperName
        : `Supporter ${index + 1}`;

    return [
      {
        supporterId:
          typeof candidate.supporterId === 'string' && candidate.supporterId.trim()
            ? candidate.supporterId
            : tipperName,
        tipperName,
        total: typeof candidate.total === 'number' ? candidate.total : Number(candidate.total) || 0,
        tipCount: typeof candidate.tipCount === 'number' ? candidate.tipCount : Number(candidate.tipCount) || 0,
        sortOrder:
          typeof candidate.sortOrder === 'number' && Number.isFinite(candidate.sortOrder)
            ? candidate.sortOrder
            : index,
      },
    ];
  });
};

const normalizeStoredSnapshot = (value: unknown): LiveSessionStoreSnapshot => {
  const candidate = value as Partial<LiveSessionStoreSnapshot>;
  const base = createDefaultSnapshot();

  return {
    ...base,
    ...candidate,
    sessionStartedAt:
      typeof candidate.sessionStartedAt === 'string' && candidate.sessionStartedAt.trim()
        ? candidate.sessionStartedAt
        : null,
    lastTipAt: typeof candidate.lastTipAt === 'string' && candidate.lastTipAt.trim() ? candidate.lastTipAt : null,
    queuedTipCount:
      typeof candidate.queuedTipCount === 'number' && Number.isFinite(candidate.queuedTipCount)
        ? Math.max(0, Math.floor(candidate.queuedTipCount))
        : 0,
    nextTipId:
      typeof candidate.nextTipId === 'number' && Number.isFinite(candidate.nextTipId)
        ? Math.max(0, Math.floor(candidate.nextTipId))
        : 0,
    alerts: sanitizeAlerts(candidate.alerts),
    leaderboard: sanitizeLeaderboard(candidate.leaderboard),
  };
};

const normalizeIncomingTip = (payload: TipNotificationPayload, fallbackId: number): BurstTip | null => {
  const tip = payload.data;
  if (!tip || typeof tip.amount !== 'number') {
    return null;
  }

  const amount = tip.amount;
  const asset = tip.asset || 'XLM';
  const isXlmTip = asset.toUpperCase() === 'XLM';
  const tipperName = tip.isAnonymous ? 'Anonymous fan' : truncateAddress(tip.senderAddress || 'Guest fan', 5, 4);
  const supporterId = tip.isAnonymous ? 'anonymous' : tip.senderAddress?.trim() || tipperName;
  const createdAt = typeof tip.createdAt === 'string' ? tip.createdAt : new Date().toISOString();
  const isLargeTip = isXlmTip && amount >= LARGE_TIP_THRESHOLD_XLM;

  return {
    supporterId,
    hypeBoost: Math.max(8, amount * 1.2),
    xlmAmount: isXlmTip ? amount : 0,
    alert: {
      id: tip.tipId || `tip-${fallbackId}`,
      tipperName,
      amount,
      asset,
      createdAt,
      isLargeTip,
    },
  };
};

const applyQueuedTips = (
  previousSession: LiveSessionStoreSnapshot,
  queuedTips: BurstTip[],
): LiveSessionStoreSnapshot => {
  const leaderboardBySupporter = new Map(
    previousSession.leaderboard.map((entry) => [entry.supporterId, entry] as const),
  );

  let tipCount = previousSession.tipCount;
  let sessionTotalXlm = previousSession.sessionTotalXlm;
  let hypeScore = previousSession.hypeScore;

  queuedTips.forEach((queuedTip) => {
    tipCount += 1;
    sessionTotalXlm += queuedTip.xlmAmount;
    hypeScore = Math.min(100, hypeScore + queuedTip.hypeBoost);

    const existing = leaderboardBySupporter.get(queuedTip.supporterId);
    if (existing) {
      leaderboardBySupporter.set(queuedTip.supporterId, {
        ...existing,
        tipperName: queuedTip.alert.tipperName,
        total: existing.total + queuedTip.xlmAmount,
        tipCount: existing.tipCount + 1,
      });
      return;
    }

    leaderboardBySupporter.set(queuedTip.supporterId, {
      supporterId: queuedTip.supporterId,
      tipperName: queuedTip.alert.tipperName,
      total: queuedTip.xlmAmount,
      tipCount: 1,
      sortOrder: getNextLeaderboardSortOrder(Array.from(leaderboardBySupporter.values())),
    });
  });

  return {
    ...previousSession,
    tipCount,
    sessionTotalXlm,
    hypeScore,
    lastTipAt: queuedTips[queuedTips.length - 1]?.alert.createdAt ?? previousSession.lastTipAt,
    queuedTipCount: 0,
    alerts: [...queuedTips.map((queuedTip) => queuedTip.alert).reverse(), ...previousSession.alerts].slice(
      0,
      MAX_ALERTS,
    ),
    leaderboard: Array.from(leaderboardBySupporter.values()).sort(compareLeaderboardEntries),
  };
};

const resetLiveSession = (current: LiveSessionStoreSnapshot): LiveSessionStoreSnapshot => ({
  ...createDefaultSnapshot(),
  artistId: current.artistId,
  privacyMode: current.privacyMode,
});

export const replayLiveSessionState = (
  initialState: LiveSessionStoreSnapshot,
  queuedTips: BurstTip[],
): LiveSessionStoreSnapshot => applyQueuedTips(initialState, queuedTips);

export const createLiveSessionSnapshot = (): LiveSessionStoreSnapshot => createDefaultSnapshot();

class LiveSessionStore {
  private readonly listeners = new Set<() => void>();

  private queuedTips: BurstTip[] = [];

  private state: LiveSessionStoreSnapshot;

  constructor(storageKey = LIVE_SESSION_STORAGE_KEY) {
    this.storageKey = storageKey;
    this.state = this.loadState();
  }

  private readonly storageKey: string;

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

  private persist = () => {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch {
      // Ignore storage failures so the live session can keep running locally.
    }
  };

  private loadState = (): LiveSessionStoreSnapshot => {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return createDefaultSnapshot();
      }

      return normalizeStoredSnapshot(JSON.parse(raw) as LiveSessionStoreSnapshot);
    } catch {
      return createDefaultSnapshot();
    }
  };

  private setState = (updater: (current: LiveSessionStoreSnapshot) => LiveSessionStoreSnapshot) => {
    this.state = updater(this.state);
    this.persist();
    this.emit();
  };

  setArtistId = (artistId: string) => {
    this.setState((current) => {
      if (current.artistId === artistId) {
        return current;
      }

      return { ...current, artistId };
    });
  };

  startSession = () => {
    this.setState((current) => {
      if (current.isSessionActive && current.sessionStartedAt) {
        return current;
      }

      return {
        ...current,
        isSessionActive: true,
        sessionStartedAt: current.sessionStartedAt || new Date().toISOString(),
      };
    });
  };

  endSession = () => {
    this.setState((current) => {
      if (!current.isSessionActive) {
        return current;
      }

      return { ...current, isSessionActive: false };
    });
  };

  togglePrivacyMode = () => {
    this.setState((current) => ({ ...current, privacyMode: !current.privacyMode }));
  };

  queueTip = (payload: TipNotificationPayload): boolean => {
    if (!this.state.isSessionActive) {
      return false;
    }

    const queuedTip = normalizeIncomingTip(payload, this.state.nextTipId);
    if (!queuedTip) {
      return false;
    }

    this.queuedTips = [...this.queuedTips, queuedTip];
    this.setState((current) => ({
      ...current,
      nextTipId: current.nextTipId + 1,
      queuedTipCount: this.queuedTips.length,
    }));
    return true;
  };

  flushQueuedTips = (): LiveSessionStoreFlushResult | null => {
    if (this.queuedTips.length === 0) {
      return null;
    }

    const queuedTips = this.queuedTips;
    this.queuedTips = [];

    const hasLargeTip = queuedTips.some((queuedTip) => queuedTip.alert.isLargeTip);
    const nextState = applyQueuedTips(this.state, queuedTips);

    this.state = nextState;
    this.persist();
    this.emit();

    return {
      hasLargeTip,
      lastTipAt: nextState.lastTipAt,
    };
  };

  decayHype = () => {
    this.setState((current) => {
      if (current.hypeScore <= 0) {
        return current;
      }

      return {
        ...current,
        hypeScore: Math.max(0, current.hypeScore - HYPE_DECAY_STEP),
      };
    });
  };

  resetSession = () => {
    this.queuedTips = [];
    this.setState((current) => resetLiveSession(current));

    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore storage failures so reset still succeeds in-memory.
    }
  };
}

export const createLiveSessionStore = (storageKey = LIVE_SESSION_STORAGE_KEY) => new LiveSessionStore(storageKey);

export { LIVE_SESSION_STORAGE_KEY };