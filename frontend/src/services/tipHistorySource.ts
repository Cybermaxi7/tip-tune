import type { TipHistoryItem } from '../types';
import type { TipFiltersState } from '../components/tip-history';
import { mockTipHistoryData } from '../fixtures/tipHistory.fixtures';
import { tipService } from './tipService';

/**
 * Interface for tip history data sources.
 * Provides a pluggable way to fetch and manage tip history data.
 */
export interface TipHistorySource {
  /**
   * Get sent tips with optional filtering and pagination.
   */
  getSentTips(filters?: TipFiltersState, page?: number, pageSize?: number): Promise<{
    items: TipHistoryItem[];
    total: number;
    hasMore: boolean;
  }>;

  /**
   * Get received tips with optional filtering and pagination.
   */
  getReceivedTips(filters?: TipFiltersState, page?: number, pageSize?: number): Promise<{
    items: TipHistoryItem[];
    total: number;
    hasMore: boolean;
  }>;

  /**
   * Get gifted tips with optional filtering and pagination.
   */
  getGiftedTips(filters?: TipFiltersState, page?: number, pageSize?: number): Promise<{
    items: TipHistoryItem[];
    total: number;
    hasMore: boolean;
  }>;

  /**
   * Get all tips for export (unpaginated, filtered).
   */
  getAllTipsForExport(type: 'sent' | 'received' | 'gifted', filters?: TipFiltersState): Promise<TipHistoryItem[]>;

  /**
   * Get tip statistics.
   */
  getStats(): Promise<{
    totalSent: number;
    totalReceived: number;
  }>;
}

/**
 * Apply filters and sorting to tip history items.
 */
export function applyFiltersAndSort(
  items: TipHistoryItem[],
  filters: TipFiltersState
): TipHistoryItem[] {
  let result = [...items];

  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo).getTime() : null;
  const amountMin = filters.amountMin ? Number(filters.amountMin) : null;
  const amountMax = filters.amountMax ? Number(filters.amountMax) : null;
  const q = (filters.searchQuery ?? '').trim().toLowerCase();
  const asset = filters.assetType;

  result = result.filter((tip) => {
    const t = new Date(tip.timestamp).getTime();
    if (dateFrom != null && t < dateFrom) return false;
    if (dateTo != null && t > dateTo + 86400000) return false;
    if (amountMin != null && tip.amount < amountMin) return false;
    if (amountMax != null && tip.amount > amountMax) return false;
    if (asset !== 'all' && (tip.assetCode || 'XLM') !== asset) return false;
    if (q) {
      const match =
        tip.tipperName?.toLowerCase().includes(q) ||
        tip.artistName?.toLowerCase().includes(q) ||
        tip.trackTitle?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const sort = filters.sort;
  result.sort((a, b) => {
    if (sort === 'newest')
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    if (sort === 'oldest')
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return b.amount - a.amount; // highest_amount
  });

  return result;
}

/**
 * Paginate an array of items.
 */
export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number
): { items: T[]; total: number; hasMore: boolean } {
  const total = items.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginatedItems = items.slice(start, end);
  const hasMore = end < total;

  return {
    items: paginatedItems,
    total,
    hasMore,
  };
}

/**
 * Fixture-based implementation of TipHistorySource.
 * Uses pre-generated mock data for development and testing.
 */
export class FixtureTipHistorySource implements TipHistorySource {
  private sentTips: TipHistoryItem[];
  private receivedTips: TipHistoryItem[];
  private giftedTips: TipHistoryItem[];

  constructor() {
    this.sentTips = mockTipHistoryData.sent;
    this.receivedTips = mockTipHistoryData.received;
    this.giftedTips = mockTipHistoryData.gifted;
  }

  async getSentTips(filters: TipFiltersState = { sort: 'newest', assetType: 'all', searchQuery: '' }, page = 1, pageSize = 10) {
    const filtered = applyFiltersAndSort(this.sentTips, filters);
    return paginateItems(filtered, page, pageSize);
  }

  async getReceivedTips(filters: TipFiltersState = { sort: 'newest', assetType: 'all', searchQuery: '' }, page = 1, pageSize = 10) {
    const filtered = applyFiltersAndSort(this.receivedTips, filters);
    return paginateItems(filtered, page, pageSize);
  }

  async getGiftedTips(filters: TipFiltersState = { sort: 'newest', assetType: 'all', searchQuery: '' }, page = 1, pageSize = 10) {
    const filtered = applyFiltersAndSort(this.giftedTips, filters);
    return paginateItems(filtered, page, pageSize);
  }

  async getAllTipsForExport(type: 'sent' | 'received' | 'gifted', filters?: TipFiltersState) {
    const tips = type === 'sent' ? this.sentTips : type === 'received' ? this.receivedTips : this.giftedTips;
    return filters ? applyFiltersAndSort(tips, filters) : [...tips];
  }

  async getStats() {
    const totalSent = this.sentTips.reduce((sum, t) => sum + (t.usdAmount ?? t.amount), 0);
    const totalReceived = this.receivedTips.reduce((sum, t) => sum + (t.usdAmount ?? t.amount), 0);
    return { totalSent, totalReceived };
  }
}

/**
 * API-based implementation of TipHistorySource.
 * Fetches data from the backend API.
 */
export class ApiTipHistorySource implements TipHistorySource {
  private userId?: string;
  private artistId?: string;

  constructor(userId?: string, artistId?: string) {
    this.userId = userId;
    this.artistId = artistId;
  }

  private mapApiTipToHistoryItem = (d: any): TipHistoryItem => ({
    id: d.id,
    tipperName: d.tipperName ?? d.fromUser?.username ?? 'Unknown',
    tipperAvatar: d.tipperAvatar ?? '',
    amount: Number(d.amount),
    message: d.message ?? '',
    timestamp: d.createdAt ?? d.timestamp ?? new Date().toISOString(),
    trackId: d.trackId,
    trackTitle: d.track?.title,
    artistName: d.artist?.artistName,
    assetCode: d.assetCode ?? 'XLM',
    usdAmount: d.fiatAmount != null ? Number(d.fiatAmount) : undefined,
    stellarTxHash: d.stellarTxHash,
  });

  async getSentTips(filters: TipFiltersState = { sort: 'newest', assetType: 'all', searchQuery: '' }, page = 1, pageSize = 10) {
    if (!this.userId) {
      return { items: [], total: 0, hasMore: false };
    }

    try {
      const response = await tipService.getUserHistory(this.userId, page, pageSize);
      const items = response.data?.map(this.mapApiTipToHistoryItem) ?? [];
      const filtered = applyFiltersAndSort(items, filters);
      return {
        items: filtered,
        total: response.meta?.total ?? 0,
        hasMore: response.meta?.hasNextPage ?? false,
      };
    } catch (error) {
      console.error('Failed to fetch sent tips:', error);
      return { items: [], total: 0, hasMore: false };
    }
  }

  async getReceivedTips(filters: TipFiltersState = { sort: 'newest', assetType: 'all', searchQuery: '' }, page = 1, pageSize = 10) {
    if (!this.artistId) {
      return { items: [], total: 0, hasMore: false };
    }

    try {
      const response = await tipService.getArtistReceived(this.artistId, page, pageSize);
      const items = response.data?.map(this.mapApiTipToHistoryItem) ?? [];
      const filtered = applyFiltersAndSort(items, filters);
      return {
        items: filtered,
        total: response.meta?.total ?? 0,
        hasMore: response.meta?.hasNextPage ?? false,
      };
    } catch (error) {
      console.error('Failed to fetch received tips:', error);
      return { items: [], total: 0, hasMore: false };
    }
  }

  async getGiftedTips(filters: TipFiltersState = { sort: 'newest', assetType: 'all', searchQuery: '' }, page = 1, pageSize = 10) {
    // TODO: Implement gifted tips API endpoint
    // For now, return empty as gifted tips are fixture-only
    return { items: [], total: 0, hasMore: false };
  }

  async getAllTipsForExport(type: 'sent' | 'received' | 'gifted', filters?: TipFiltersState) {
    // For export, we need all data, so fetch with a large limit
    const result = await this.getTipsByType(type, filters, 1, 1000);
    return result.items;
  }

  private async getTipsByType(type: 'sent' | 'received' | 'gifted', filters?: TipFiltersState, page = 1, pageSize = 10) {
    switch (type) {
      case 'sent':
        return this.getSentTips(filters, page, pageSize);
      case 'received':
        return this.getReceivedTips(filters, page, pageSize);
      case 'gifted':
        return this.getGiftedTips(filters, page, pageSize);
    }
  }

  async getStats() {
    // TODO: Implement stats API endpoint
    // For now, return zeros
    return { totalSent: 0, totalReceived: 0 };
  }
}