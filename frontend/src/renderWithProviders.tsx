import type { ComponentType, ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LiveRegionProvider } from './components/a11y/LiveRegion';
import { WalletContext } from './contexts/WalletContext';
import type { EnhancedWalletContextType, WalletBalance, Network } from './types/wallet';

type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  route?: string;
  path?: string;
  initialEntries?: string[];
  queryClient?: QueryClient;
  wallet?: Partial<EnhancedWalletContextType> & {
    balance?: WalletBalance | null;
    network?: Network;
  };
  wrapper?: ComponentType<{ children: ReactNode }>;
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWalletContext(
  wallet: RenderWithProvidersOptions['wallet'],
): EnhancedWalletContextType | null {
  if (!wallet) {
    return null;
  }

  const noop = async () => {};

  return {
    connectionState: 'connected',
    isConnected: false,
    isConnecting: false,
    publicKey: null,
    network: 'testnet',
    balance: null,
    error: null,
    connectionStatus: {
      state: 'connected',
      canRetry: false,
    },
    connect: noop,
    disconnect: noop,
    switchNetwork: noop,
    refreshBalance: noop,
    signTransaction: async () => '',
    retryConnection: noop,
    clearError: () => {},
    getConnectionStatus: () => ({
      state: 'connected',
      canRetry: false,
    }),
    ...wallet,
  };
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route,
    path,
    initialEntries,
    queryClient = createQueryClient(),
    wallet,
    wrapper: CustomWrapper,
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  const entries = initialEntries ?? (route ? [route] : undefined);
  const walletContext = createWalletContext(wallet);

  function Wrapper({ children }: { children: ReactNode }) {
    const content = (
      <LiveRegionProvider>
        <QueryClientProvider client={queryClient}>
          {walletContext ? (
            <WalletContext.Provider value={walletContext}>
              {children}
            </WalletContext.Provider>
          ) : (
            children
          )}
        </QueryClientProvider>
      </LiveRegionProvider>
    );

    const routedContent = path ? (
      <MemoryRouter initialEntries={entries}>
        <Routes>
          <Route path={path} element={content} />
        </Routes>
      </MemoryRouter>
    ) : entries ? (
      <MemoryRouter initialEntries={entries}>{content}</MemoryRouter>
    ) : (
      content
    );

    if (!CustomWrapper) {
      return routedContent;
    }

    return <CustomWrapper>{routedContent}</CustomWrapper>;
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export type { RenderWithProvidersOptions };
