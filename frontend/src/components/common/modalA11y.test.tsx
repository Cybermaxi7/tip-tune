import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal';
import TipModal from '../tip/TipModal';
import { LiveRegionProvider } from '../a11y/LiveRegion';

const renderModal = (isOpen = true, onClose = vi.fn()) =>
  render(
    <Modal isOpen={isOpen} onClose={onClose} title="Example modal">
      <div>
        <input aria-label="Name" />
        <button type="button">Confirm</button>
      </div>
    </Modal>,
  );

describe('modal accessibility behavior', () => {
  it('moves initial focus into the shared modal shell', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close example modal/i })).toHaveFocus();
    });
  });

  it('traps keyboard focus inside the modal', async () => {
    const user = userEvent.setup();
    renderModal();

    const closeButton = screen.getByRole('button', { name: /close example modal/i });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: /confirm/i })).toHaveFocus();
  });

  it('restores focus to the trigger after closing', async () => {
    const user = userEvent.setup();

    const Example = () => {
      const [isOpen, setIsOpen] = React.useState(false);

      return (
        <div>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open modal
          </button>
          <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Example modal">
            <button type="button">Confirm</button>
          </Modal>
        </div>
      );
    };

    render(<Example />);

    const trigger = screen.getByRole('button', { name: /open modal/i });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /close example modal/i }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes the tip modal with Escape without dropping page focus behavior', async () => {
    vi.useFakeTimers();

    try {
      const onClose = vi.fn();
      render(
        <LiveRegionProvider>
          <button type="button">Before modal</button>
          <TipModal
            isOpen
            onClose={onClose}
            artistId="artist-1"
            artistName="Luna Waves"
            walletBalance={{ xlm: 100, usdc: 25 }}
          />
        </LiveRegionProvider>,
      );

      expect(screen.getByRole('button', { name: /close tip modal/i })).toHaveFocus();
      fireEvent.keyDown(document, { key: 'Escape' });
      await vi.advanceTimersByTimeAsync(300);

      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
