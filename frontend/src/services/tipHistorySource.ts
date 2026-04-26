import type { TipHistoryItem } from '../types';
import type { TipFiltersState } from '../components/tip-history';

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
  const q = filters.searchQuery.trim().toLowerCase();
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