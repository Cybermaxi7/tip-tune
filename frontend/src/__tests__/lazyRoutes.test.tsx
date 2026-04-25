import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/analytics/AnalyticsDashboard", () => ({
  default: () => <div data-testid="analytics-route">Analytics route</div>,
}));
vi.mock("../pages/SearchPage", () => ({
  default: () => <div data-testid="search-route">Search route</div>,
}));
vi.mock("../pages/ExplorePage", () => ({
  default: () => <div data-testid="explore-route">Explore route</div>,
}));
vi.mock("../pages/BadgesPage", () => ({
  default: () => <div data-testid="badges-route">Badges route</div>,
}));
vi.mock("../pages/DashboardPage", () => ({
  default: () => <div data-testid="dashboard-route">Dashboard route</div>,
}));
vi.mock("../pages/TipHistoryPage", () => ({
  default: () => <div data-testid="tip-history-route">Tip history route</div>,
}));
vi.mock("../pages/ArtistProfilePage", () => ({
  default: () => <div data-testid="artist-profile-route">Artist profile route</div>,
}));
vi.mock("../pages/SettingsPage", () => ({
  default: () => <div data-testid="settings-route">Settings route</div>,
}));
vi.mock("../components/live-performance/LivePerformanceMode", () => ({
  default: () => <div data-testid="live-performance-route">Live performance route</div>,
}));
vi.mock("../pages/TipReceiptPage", () => ({
  default: () => <div data-testid="tip-receipt-route">Tip receipt route</div>,
}));
vi.mock("../pages/GiftReceiptPage", () => ({
  default: () => <div data-testid="gift-receipt-route">Gift receipt route</div>,
}));
vi.mock("../pages/LeaderboardsPage", () => ({
  LeaderboardsPage: () => <div data-testid="leaderboards-route">Leaderboards route</div>,
}));
vi.mock("../components/ArtistOnboarding", () => ({
  ArtistOnboarding: () => <div data-testid="onboarding-route">Onboarding route</div>,
}));

import {
  LazyAnalyticsDashboard,
  LazyArtistOnboarding,
  LazyArtistProfilePage,
  LazyBadgesPage,
  LazyDashboardPage,
  LazyExplorePage,
  LazyGiftReceiptPage,
  LazyLeaderboardsPage,
  LazyLivePerformanceMode,
  LazyRoute,
  LazySearchPage,
  LazySettingsPage,
  LazyTipHistoryPage,
  LazyTipReceiptPage,
} from "../lazyRoutes";

const lazyRoutes = [
  {
    label: "Loading analytics",
    element: <LazyAnalyticsDashboard />,
    testId: "analytics-route",
  },
  {
    label: "Loading search",
    element: <LazySearchPage />,
    testId: "search-route",
  },
  {
    label: "Loading explore",
    element: <LazyExplorePage />,
    testId: "explore-route",
  },
  {
    label: "Loading badges",
    element: <LazyBadgesPage />,
    testId: "badges-route",
  },
  {
    label: "Loading leaderboards",
    element: <LazyLeaderboardsPage />,
    testId: "leaderboards-route",
  },
  {
    label: "Loading dashboard",
    element: <LazyDashboardPage />,
    testId: "dashboard-route",
  },
  {
    label: "Loading settings",
    element: <LazySettingsPage />,
    testId: "settings-route",
  },
  {
    label: "Loading artist profile",
    element: <LazyArtistProfilePage />,
    testId: "artist-profile-route",
  },
  {
    label: "Loading tip history",
    element: <LazyTipHistoryPage />,
    testId: "tip-history-route",
  },
  {
    label: "Loading tip receipt",
    element: <LazyTipReceiptPage />,
    testId: "tip-receipt-route",
  },
  {
    label: "Loading gift receipt",
    element: <LazyGiftReceiptPage />,
    testId: "gift-receipt-route",
  },
  {
    label: "Loading live performance",
    element: <LazyLivePerformanceMode />,
    testId: "live-performance-route",
  },
  {
    label: "Loading onboarding",
    element: <LazyArtistOnboarding />,
    testId: "onboarding-route",
  },
] as const;

describe("lazy route exports", () => {
  lazyRoutes.forEach(({ label, element, testId }) => {
    it(`renders ${label.toLowerCase()} through the suspense boundary`, async () => {
      render(<LazyRoute label={label}>{element}</LazyRoute>);

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
    });
  });
});
