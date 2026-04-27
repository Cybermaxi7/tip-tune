import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FixtureTipHistorySource, ApiTipHistorySource } from '../services/tipHistorySource';
import { mockTipHistoryData } from '../fixtures/tipHistory.fixtures';
import type { TipFiltersState } from '../components/tip-history';

// Mock the tipService for API tests
vi.mock('../services/tipService', () => ({
  tipService: {
    getUserHistory: vi.fn(),
    getArtistReceived: vi.fn(),
  },
}));

describe('TipHistorySource', () => {
  describe('FixtureTipHistorySource', () => {
    let source: FixtureTipHistorySource;

    beforeEach(() => {
      source = new FixtureTipHistorySource();
    });

    it('should return sent tips with pagination', async () => {
      const result = await source.getSentTips({}, 1, 10);
      expect(result.items).toHaveLength(10);
      expect(result.total).toBe(mockTipHistoryData.sent.length);
      expect(result.hasMore).toBe(true);
    });

    it('should return received tips with pagination', async () => {
      const result = await source.getReceivedTips({}, 1, 10);
      expect(result.items).toHaveLength(10);
      expect(result.total).toBe(mockTipHistoryData.received.length);
      expect(result.hasMore).toBe(true);
    });

    it('should return gifted tips with pagination', async () => {
      const result = await source.getGiftedTips({}, 1, 10);
      expect(result.items).toHaveLength(10);
      expect(result.total).toBe(mockTipHistoryData.gifted.length);
      expect(result.hasMore).toBe(false); // Only 10 gifted tips
    });

    it('should filter sent tips by amount range', async () => {
      const filters: TipFiltersState = {
        sort: 'newest',
        assetType: 'all',
        searchQuery: '',
        amountMin: '20',
        amountMax: '30',
      };
      const result = await source.getSentTips(filters, 1, 100);
      expect(result.items.every(tip => tip.amount >= 20 && tip.amount <= 30)).toBe(true);
    });

    it('should filter tips by asset type', async () => {
      const filters: TipFiltersState = {
        sort: 'newest',
        assetType: 'USDC',
        searchQuery: '',
      };
      const result = await source.getSentTips(filters, 1, 100);
      expect(result.items.every(tip => tip.assetCode === 'USDC')).toBe(true);
    });

    it('should filter tips by search query', async () => {
      const filters: TipFiltersState = {
        sort: 'newest',
        assetType: 'all',
        searchQuery: 'Artist A',
      };
      const result = await source.getSentTips(filters, 1, 100);
      expect(result.items.every(tip => tip.artistName?.includes('Artist A'))).toBe(true);
    });

    it('should sort tips by amount (highest first)', async () => {
      const filters: TipFiltersState = {
        sort: 'highest_amount',
        assetType: 'all',
        searchQuery: '',
      };
      const result = await source.getSentTips(filters, 1, 5);
      expect(result.items[0].amount).toBeGreaterThanOrEqual(result.items[1].amount);
    });

    it('should return all tips for export', async () => {
      const tips = await source.getAllTipsForExport('sent');
      expect(tips).toHaveLength(mockTipHistoryData.sent.length);
    });

    it('should return filtered tips for export', async () => {
      const filters: TipFiltersState = {
        sort: 'newest',
        assetType: 'XLM',
        searchQuery: '',
      };
      const tips = await source.getAllTipsForExport('sent', filters);
      expect(tips.every(tip => tip.assetCode === 'XLM')).toBe(true);
    });

    it('should return correct stats', async () => {
      const stats = await source.getStats();
      const expectedSent = mockTipHistoryData.sent.reduce((sum, t) => sum + (t.usdAmount ?? t.amount), 0);
      const expectedReceived = mockTipHistoryData.received.reduce((sum, t) => sum + (t.usdAmount ?? t.amount), 0);
      expect(stats.totalSent).toBe(expectedSent);
      expect(stats.totalReceived).toBe(expectedReceived);
    });
  });

  describe('ApiTipHistorySource', () => {
    let tipService: any;

    beforeEach(async () => {
      vi.clearAllMocks();
      ({ tipService } = await import('../services/tipService'));
    });

    it('should fetch sent tips from API', async () => {
      const mockResponse = {
        data: [{ id: '1', tipperName: 'User', amount: 10, timestamp: new Date().toISOString() }],
        meta: { total: 1, hasNextPage: false },
      };
      vi.mocked(tipService.getUserHistory).mockResolvedValue(mockResponse as any);

      const source = new ApiTipHistorySource('user123');
      const result = await source.getSentTips();

      expect(tipService.getUserHistory).toHaveBeenCalledWith('user123', 1, 10);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should fetch received tips from API', async () => {
      const mockResponse = {
        data: [{ id: '1', tipperName: 'User', amount: 10, timestamp: new Date().toISOString() }],
        meta: { total: 1, hasNextPage: false },
      };
      vi.mocked(tipService.getArtistReceived).mockResolvedValue(mockResponse as any);

      const source = new ApiTipHistorySource(undefined, 'artist123');
      const result = await source.getReceivedTips();

      expect(tipService.getArtistReceived).toHaveBeenCalledWith('artist123', 1, 10);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty results when no user/artist ID provided', async () => {
      const source = new ApiTipHistorySource();
      const result = await source.getSentTips();
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      vi.mocked(tipService.getUserHistory).mockRejectedValue(new Error('API Error'));

      const source = new ApiTipHistorySource('user123');
      const result = await source.getSentTips();

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});