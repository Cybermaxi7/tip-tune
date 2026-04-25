import { useState, useCallback } from "react";
import { BrowserRouter } from "react-router-dom";
import { Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";

import AppHeader from "./components/layout/AppHeader";
import MusicPlayer, { tracks } from "./components/player/MusicPlayer";
import InstallPrompt from "./components/InstallPrompt";
import { AmbientMode } from "./components/ambient";

import { WalletProvider } from "./contexts/WalletContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PlayerProvider } from "./contexts/PlayerContext";

/* Accessibility */
import { LiveRegionProvider } from "./components/a11y/LiveRegion";
import { SkipLink, KeyboardShortcutHelp } from "./components/a11y";
import { useKeyboardShortcuts } from "./hooks";
import {
  LazyArtistOnboarding,
  LazyArtistProfilePage,
  LazyBadgesPage,
  LazyDashboardPage,
  LazyExplorePage,
  LazyAnalyticsDashboard,
  LazyGiftReceiptPage,
  LazyLivePerformanceMode,
  LazyLeaderboardsPage,
  LazyRoute,
  LazySearchPage,
  LazySettingsPage,
  LazyTipHistoryPage,
  LazyTipReceiptPage,
} from "./lazyRoutes";
import { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppHeader from './components/layout/AppHeader';
import MusicPlayer, { tracks } from './components/player/MusicPlayer';
import InstallPrompt from './components/InstallPrompt';
import { AmbientMode } from './components/ambient';
import WidgetErrorBoundary from './components/common/WidgetErrorBoundary';
import { PlayerProvider } from './contexts/PlayerContext';
import { LiveRegionProvider } from './components/a11y/LiveRegion';
import { SkipLink, KeyboardShortcutHelp } from './components/a11y';
import { useKeyboardShortcuts } from './hooks';
import { appRoutes } from './routes';

function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);

  const openShortcuts = useCallback(() => setShowShortcuts(true), []);
  const closeShortcuts = useCallback(() => setShowShortcuts(false), []);

  useKeyboardShortcuts([
    { key: "?", action: openShortcuts, description: "Open keyboard shortcuts" },
  ]);

  return (
    <BrowserRouter>
      <WalletProvider>
        <ThemeProvider>
          <LiveRegionProvider>
            <div className="min-h-screen bg-app text-app theme-transition">
              <SkipLink targetId="main-content" />

              <AppHeader />

              <PlayerProvider tracks={tracks}>
                <main
                  id="main-content"
                  className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6"
                  tabIndex={-1}
                >
                  <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/search"
                element={
                  <LazyRoute label="Loading search">
                    <LazySearchPage />
                  </LazyRoute>
                }
              />
              <Route
                path="/explore"
                element={
                  <LazyRoute label="Loading explore">
                    <LazyExplorePage />
                  </LazyRoute>
                }
              />

              <Route
                path="/badges"
                element={
                  <LazyRoute label="Loading badges">
                    <LazyBadgesPage />
                  </LazyRoute>
                }
              />
              <Route
                path="/leaderboards"
                element={
                  <LazyRoute label="Loading leaderboards">
                    <LazyLeaderboardsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <LazyRoute label="Loading dashboard">
                    <LazyDashboardPage />
                  </LazyRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <LazyRoute label="Loading settings">
                    <LazySettingsPage />
                  </LazyRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <LazyRoute label="Loading analytics">
                    <LazyAnalyticsDashboard />
                  </LazyRoute>
                }
              />

              <Route
                path="/artists/:artistId"
                element={
                  <LazyRoute label="Loading artist profile">
                    <LazyArtistProfilePage />
                  </LazyRoute>
                }
              />

              <Route
                path="/tips/history"
                element={
                  <LazyRoute label="Loading tip history">
                    <LazyTipHistoryPage />
                  </LazyRoute>
                }
              />
              <Route
                path="/tips/:tipId/receipt"
                element={
                  <LazyRoute label="Loading tip receipt">
                    <LazyTipReceiptPage />
                  </LazyRoute>
                }
              />
              <Route
                path="/gifts/:giftId"
                element={
                  <LazyRoute label="Loading gift receipt">
                    <LazyGiftReceiptPage />
                  </LazyRoute>
                }
              />

              <Route
                path="/live-performance"
                element={
                  <LazyRoute label="Loading live performance">
                    <LazyLivePerformanceMode />
                  </LazyRoute>
                }
              />

              <Route
                path="/onboarding"
                element={
                  <LazyRoute label="Loading onboarding">
                    <LazyArtistOnboarding />
                  </LazyRoute>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
                  </Routes>

                  <MusicPlayer tracks={tracks} />
                  <AmbientMode />
                </main>
              </PlayerProvider>
    <LiveRegionProvider>
      <div className="min-h-screen bg-app text-app theme-transition">
        <SkipLink targetId="main-content" />

        <AppHeader />

        <PlayerProvider tracks={tracks}>
          <main
            id="main-content"
            className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6"
            tabIndex={-1}
          >
            <Routes>
              {appRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
            </Routes>

            <WidgetErrorBoundary
              title="Player unavailable"
              description="The music player hit an error. You can retry it without interrupting the current page."
              className="mt-6"
            >
              <MusicPlayer tracks={tracks} />
            </WidgetErrorBoundary>
            <AmbientMode />
          </main>
        </PlayerProvider>

              <KeyboardShortcutHelp
                isOpen={showShortcuts}
                onClose={closeShortcuts}
              />

              <InstallPrompt />
            </div>
          </LiveRegionProvider>
        </ThemeProvider>
      </WalletProvider>
    </BrowserRouter>
  );
}

export default App;
