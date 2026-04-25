import { Suspense, lazy, type ComponentType, type ReactNode } from "react";

const lazyRouteStyles =
  "flex min-h-[42vh] items-center justify-center px-4 py-10";
const lazyRouteCardStyles =
  "flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 shadow-lg backdrop-blur";
const spinnerStyles =
  "h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent";

type LazyRouteProps = {
  children: ReactNode;
  label: string;
};

function lazyNamed<T extends ComponentType<any>, M>(
  loader: () => Promise<M>,
  resolve: (module: M) => T,
) {
  return lazy(() => loader().then((module) => ({ default: resolve(module) })));
}

function LazyRouteFallback({ label }: { label: string }) {
  return (
    <div className={lazyRouteStyles}>
      <div className={lazyRouteCardStyles}>
        <span className={spinnerStyles} aria-hidden="true" />
        <div className="text-sm font-medium text-slate-700">{label}</div>
      </div>
    </div>
  );
}

export function LazyRoute({ children, label }: LazyRouteProps) {
  return <Suspense fallback={<LazyRouteFallback label={label} />}>{children}</Suspense>;
}

export const LazyAnalyticsDashboard = lazy(() =>
  import("./components/analytics/AnalyticsDashboard"),
);

export const LazySearchPage = lazy(() => import("./pages/SearchPage"));
export const LazyExplorePage = lazy(() => import("./pages/ExplorePage"));
export const LazyBadgesPage = lazy(() => import("./pages/BadgesPage"));
export const LazyDashboardPage = lazy(() => import("./pages/DashboardPage"));
export const LazyTipHistoryPage = lazy(() => import("./pages/TipHistoryPage"));
export const LazyArtistProfilePage = lazy(() =>
  import("./pages/ArtistProfilePage"),
);
export const LazyArtistOnboarding = lazyNamed(
  () => import("./components/ArtistOnboarding"),
  (module) => module.ArtistOnboarding,
);
export const LazySettingsPage = lazy(() => import("./pages/SettingsPage"));

export const LazyLivePerformanceMode = lazy(() =>
  import("./components/live-performance/LivePerformanceMode"),
);

export const LazyLeaderboardsPage = lazyNamed(
  () => import("./pages/LeaderboardsPage"),
  (module) => module.LeaderboardsPage,
);

let receiptBundlePromise:
  | Promise<
      [
        typeof import("./pages/TipReceiptPage"),
        typeof import("./pages/GiftReceiptPage"),
      ]
    >
  | null = null;

function loadReceiptBundle() {
  if (!receiptBundlePromise) {
    receiptBundlePromise = Promise.all([
      import("./pages/TipReceiptPage"),
      import("./pages/GiftReceiptPage"),
    ]);
  }

  return receiptBundlePromise;
}

export const LazyTipReceiptPage = lazy(() =>
  loadReceiptBundle().then(([module]) => ({ default: module.default })),
);

export const LazyGiftReceiptPage = lazy(() =>
  loadReceiptBundle().then(([, module]) => ({ default: module.default })),
);
