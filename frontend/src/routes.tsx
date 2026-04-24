import type { ReactElement } from 'react';
import HomePage from './pages/HomePage';
import ExplorePage from './pages/ExplorePage';
import SearchPage from './pages/SearchPage';
import NotFoundPage from './pages/NotFoundPage';
import BadgesPage from './pages/BadgesPage';
import { LeaderboardsPage } from './pages/LeaderboardsPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import TipHistoryPage from './pages/TipHistoryPage';
import TipReceiptPage from './pages/TipReceiptPage';
import GiftReceiptPage from './pages/GiftReceiptPage';
import ArtistProfilePage from './pages/ArtistProfilePage';
import { ArtistOnboarding } from './components/ArtistOnboarding';
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard';
import LivePerformanceMode from './components/live-performance/LivePerformanceMode';
import WidgetErrorBoundary from './components/common/WidgetErrorBoundary';

export interface AppRouteDefinition {
  path: string;
  element: ReactElement;
}

export const homeRouteElement = <HomePage />;

export const appRoutes: AppRouteDefinition[] = [
  { path: '/', element: homeRouteElement },
  { path: '/search', element: <SearchPage /> },
  { path: '/explore', element: <ExplorePage /> },
  { path: '/badges', element: <BadgesPage /> },
  { path: '/leaderboards', element: <LeaderboardsPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/settings', element: <SettingsPage /> },
  {
    path: '/analytics',
    element: (
      <WidgetErrorBoundary
        title="Analytics temporarily unavailable"
        description="One of the analytics widgets failed, so the rest of the app is still available while you retry."
      >
        <AnalyticsDashboard />
      </WidgetErrorBoundary>
    ),
  },
  { path: '/artists/:artistId', element: <ArtistProfilePage /> },
  { path: '/tips/history', element: <TipHistoryPage /> },
  { path: '/tips/:tipId/receipt', element: <TipReceiptPage /> },
  { path: '/gifts/:giftId', element: <GiftReceiptPage /> },
  {
    path: '/live-performance',
    element: (
      <WidgetErrorBoundary
        title="Live widgets temporarily unavailable"
        description="The live-performance surface hit an error. Retry the live widget without reloading the whole app."
      >
        <LivePerformanceMode />
      </WidgetErrorBoundary>
    ),
  },
  { path: '/onboarding', element: <ArtistOnboarding /> },
  { path: '*', element: <NotFoundPage /> },
];
