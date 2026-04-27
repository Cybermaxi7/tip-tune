import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TipCard, TipFilters, TipStats } from '../components/tip-history';
import type { TipFiltersState } from '../components/tip-history';
import { defaultTipFilters } from '../components/tip-history';
import type { TipHistoryItem } from '../types';
import { exportTipHistoryToCSV } from '../utils/formatter';
import { ApiTipHistorySource, FixtureTipHistorySource } from '../services/tipService';
import type { TipHistorySource } from '../services/tipHistorySource';
import SocialShareModal from '../components/tip/SocialShareModal';

const PAGE_SIZE = 10;

/**
 * Hook to get the appropriate tip history data source.
 * Uses API if user/artist IDs are available, otherwise falls back to fixtures.
 */
function useTipHistorySource(): TipHistorySource {
  const userId = (import.meta.env.VITE_DEV_USER_ID as string) || null;
  const artistId = (import.meta.env.VITE_DEV_ARTIST_ID as string) || null;

  return useMemo(() => {
    if (userId || artistId) {
      return new ApiTipHistorySource(userId || undefined, artistId || undefined);
    }
    return new FixtureTipHistorySource();
  }, [userId, artistId]);
}

export const TipHistoryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as 'sent' | 'received' | 'gifts' | null;
  const [activeTab, setActiveTab] = useState<'sent' | 'received' | 'gifts'>(
    tabFromUrl === 'sent' || tabFromUrl === 'received' || tabFromUrl === 'gifts' ? tabFromUrl : 'sent'
  );
  const [filters, setFilters] = useState<TipFiltersState>(defaultTipFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [currentItems, setCurrentItems] = useState<TipHistoryItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [shareTip, setShareTip] = useState<TipHistoryItem | null>(null);
  const [shareVariant, setShareVariant] = useState<'sent' | 'received'>('sent');
  const [isShareOpen, setIsShareOpen] = useState(false);

  const tipHistorySource = useTipHistorySource();

  const fetchCurrentTabData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      let result;
      switch (activeTab) {
        case 'sent':
          result = await tipHistorySource.getSentTips(filters, page, PAGE_SIZE);
          break;
        case 'received':
          result = await tipHistorySource.getReceivedTips(filters, page, PAGE_SIZE);
          break;
        case 'gifts':
          result = await tipHistorySource.getGiftedTips(filters, page, PAGE_SIZE);
          break;
      }
      setCurrentItems(result.items);
      setTotalItems(result.total);
      setHasMore(result.hasMore);
    } catch (e: any) {
      setApiError(e?.message ?? 'Failed to load tip history');
      setCurrentItems([]);
      setTotalItems(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [tipHistorySource, activeTab, filters, page]);

  useEffect(() => {
    fetchCurrentTabData();
  }, [fetchCurrentTabData]);

  // Reset page when tab or filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, filters]);

  const stats = useMemo(() => tipHistorySource.getStats(), [tipHistorySource]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const handleShare = (tip: TipHistoryItem, variant: 'sent' | 'received') => {
    setShareTip(tip);
    setShareVariant(variant);
    setIsShareOpen(true);
  };

  const handleTabChange = (tab: 'sent' | 'received' | 'gifts') => {
    setActiveTab(tab);
    setPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  const handleExport = async () => {
    try {
      const allTips = await tipHistorySource.getAllTipsForExport(activeTab, filters);
      exportTipHistoryToCSV(allTips);
    } catch (error) {
      console.error('Failed to export tips:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          Tip History
        </h1>
        <p className="text-gray-600 mb-6">
          View and filter all tips you&apos;ve sent and received.
        </p>

        {apiError && (
          <div
            className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm"
            role="alert"
          >
            {apiError} Showing sample data.
          </div>
        )}

        <TipStats
          totalSent={stats.totalSent}
          totalReceived={stats.totalReceived}
          isUsd={true}
          isLoading={loading}
        />

        <div className="mt-6 bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
          {/* Tabs */}
          <div
            className="flex border-b border-gray-200 mb-6"
            role="tablist"
            aria-label="Tip history tabs"
          >
            <button
              role="tab"
              aria-selected={activeTab === 'sent'}
              onClick={() => handleTabChange('sent')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'sent'
                  ? 'border-primary-blue text-primary-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Sent
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'received'}
              onClick={() => handleTabChange('received')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'received'
                  ? 'border-primary-blue text-primary-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Received
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'gifts'}
              onClick={() => handleTabChange('gifts')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'gifts'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              data-testid="gifts-tab"
            >
              🎁 Gifts
              {totalItems > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 font-semibold">
                  {totalItems}
                </span>
              )}
            </button>
          </div>

          {/* Filters */}
          <TipFilters
            filters={filters}
            onFiltersChange={setFilters}
            resultCount={totalItems}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={handleExport}
              disabled={totalItems === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-blue rounded-lg hover:bg-secondary-indigo disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Export to CSV
            </button>
          </div>

          {/* List */}
          <div className="mt-6 space-y-4" role="list">
            {loading && currentItems.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                Loading tips...
              </div>
            ) : currentItems.length === 0 ? (
              <p className="text-center py-12 text-gray-500">
                No tips match your filters.
              </p>
            ) : (
              currentItems.map((tip) => (
                <TipCard
                  key={tip.id}
                  tip={tip}
                  variant={activeTab === 'gifts' ? (tip.gift?.recipient.id === 'u1' ? 'received' : 'sent') : activeTab as 'sent' | 'received'}
                  giftVariant={
                    activeTab === 'gifts'
                      ? tip.gift?.recipient.id === 'u1' ? 'received' : 'given'
                      : undefined
                  }
                  onShare={handleShare}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="mt-6 flex flex-wrap items-center justify-between gap-3"
              aria-label="Pagination"
            >
              <p className="text-sm text-gray-600">
                Page{' '}
                <span className="font-medium">{currentPage}</span> of{' '}
                <span className="font-medium">{totalPages}</span>
                {' · '}
                <span className="font-medium">{totalItems}</span> total
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SocialShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        tip={shareTip}
        variant={shareVariant}
      />
    </div>
  );
};

export default TipHistoryPage;
