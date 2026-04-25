import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import svc from './utils/serviceWorker';
import { initializeThemeOnLoad } from './utils/theme';

const App = lazy(() => import('./App'));

function BootScreen() {
  return (
    <div className="min-h-screen bg-app text-app flex items-center justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 shadow-lg backdrop-blur">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"
          aria-hidden="true"
        />
        <div className="text-sm font-medium text-slate-700">Loading TipTune...</div>
      </div>
    </div>
  );
}

// Apply persisted/system theme before React boot to minimize flashing.
initializeThemeOnLoad();

// Register the service worker early so offline capabilities are available.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  svc.registerServiceWorker();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<BootScreen />}>
      <App />
    </Suspense>
  </React.StrictMode>,
);
