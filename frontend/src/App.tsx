import { useState, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WalletProvider } from "./contexts/WalletContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PlayerProvider } from "./contexts/PlayerContext";
import { LiveRegionProvider } from "./components/a11y/LiveRegion";
import { SkipLink, KeyboardShortcutHelp } from "./components/a11y";
import { useKeyboardShortcuts } from "./hooks";
import AppHeader from "./components/layout/AppHeader";
import MusicPlayer, { tracks } from "./components/player/MusicPlayer";
import InstallPrompt from "./components/InstallPrompt";
import { AmbientMode } from "./components/ambient";
import WidgetErrorBoundary from "./components/common/WidgetErrorBoundary";
import { appRoutes } from "./routes";

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
