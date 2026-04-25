import { renderWithProviders } from '../../../renderWithProviders';
import { screen } from '@testing-library/dom';
import '@testing-library/jest-dom';
import React from 'react';
import WalletBalanceWidget from '../WalletBalanceWidget';
import { vi } from 'vitest';

describe('WalletBalanceWidget', () => {
  it('renders XLM balance when wallet is connected', () => {
    renderWithProviders(<WalletBalanceWidget />, {
      wallet: {
        isConnected: true,
        balance: { asset: 'XLM', balance: '12.3456789' },
        refreshBalance: vi.fn(),
      },
    });

    expect(screen.getByLabelText('Wallet balance')).toBeInTheDocument();
    expect(screen.getByText(/12\.35 XLM/)).toBeInTheDocument();
  });
});

