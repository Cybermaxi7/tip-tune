import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WidgetErrorBoundary from './WidgetErrorBoundary';

const ThrowOnRender: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('boom');
  }

  return <div>Healthy widget</div>;
};

describe('WidgetErrorBoundary', () => {
  it('renders a fallback and retries after a widget crash', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const Example = () => {
        const [shouldThrow, setShouldThrow] = React.useState(true);

        return (
          <div>
            <button type="button" onClick={() => setShouldThrow(false)}>
              Recover
            </button>
            <WidgetErrorBoundary>
              <ThrowOnRender shouldThrow={shouldThrow} />
            </WidgetErrorBoundary>
          </div>
        );
      };

      render(<Example />);
      expect(screen.getByRole('alert')).toHaveTextContent(/widget temporarily unavailable/i);

      await user.click(screen.getByRole('button', { name: /recover/i }));
      await user.click(screen.getByRole('button', { name: /retry widget/i }));
      expect(screen.getByText(/healthy widget/i)).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
