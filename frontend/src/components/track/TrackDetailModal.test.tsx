import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import TrackDetailModal from './TrackDetailModal';

vi.mock('@/hooks/useAudio', () => ({
  useAudio: vi.fn(() => ({
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 180,
    volume: 1,
    isMuted: false,
    togglePlayPause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
  })),
}));

vi.mock('../tip', () => ({
  TipButton: ({ amount, currency, onTip, variant }: any) => (
    <button
      onClick={() => onTip(amount, currency)}
      data-testid="tip-button"
      className={variant}
    >
      Tip {amount} {currency}
    </button>
  ),
}));

vi.mock('@/utils/time', () => ({
  formatTime: vi.fn((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }),
}));

const mockTrack = {
  id: '1',
  title: 'Test Track',
  artist: {
    id: 'artist-1',
    artistName: 'Test Artist',
  },
  coverArt: 'https://example.com/cover.jpg',
  plays: 100,
  tips: 50,
  genre: 'Electronic',
  duration: 180,
};

describe('TrackDetailModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    track: mockTrack,
    onTrackChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders track details when open', () => {
    render(<TrackDetailModal {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Test Track' })).toBeInTheDocument();
    expect(screen.getByText('by Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Electronic')).toBeInTheDocument();
    expect(screen.getByText(/100 plays/)).toBeInTheDocument();
    expect(screen.getByText(/50 tips/)).toBeInTheDocument();
  });

  it('displays cover art when available', () => {
    render(<TrackDetailModal {...defaultProps} />);

    const coverImage = screen.getByAltText('Test Track');
    expect(coverImage).toBeInTheDocument();
    expect(coverImage).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('shows placeholder when no cover art', () => {
    const trackWithoutCover = { ...mockTrack, coverArt: '' };
    render(<TrackDetailModal {...defaultProps} track={trackWithoutCover} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Test Track' })).toBeInTheDocument();
    expect(screen.queryByAltText('Test Track')).toBeNull();
  });

  it('calls onClose when close button is clicked', () => {
    render(<TrackDetailModal {...defaultProps} />);

    const closeButton = screen.getByLabelText('Close modal');
    fireEvent.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const { container } = render(<TrackDetailModal {...defaultProps} />);
    const backdrop = container.firstElementChild?.firstElementChild as HTMLElement | null;

    expect(backdrop).not.toBeNull();
    if (!backdrop) return;

    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders tip button with correct props', () => {
    render(<TrackDetailModal {...defaultProps} />);

    const tipButton = screen.getByTestId('tip-button');
    expect(tipButton).toBeInTheDocument();
    expect(tipButton).toHaveTextContent('Tip 1 XLM');
  });

  it('handles tip button click', () => {
    render(<TrackDetailModal {...defaultProps} />);

    const tipButton = screen.getByTestId('tip-button');
    fireEvent.click(tipButton);
  });

  it('renders action buttons', () => {
    render(<TrackDetailModal {...defaultProps} />);

    expect(screen.getByText('Share')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('handles share button click', () => {
    render(<TrackDetailModal {...defaultProps} />);

    const shareButton = screen.getByText('Share').closest('button');
    if (shareButton) {
      fireEvent.click(shareButton);
    }
  });

  it('handles add to playlist button click', () => {
    render(<TrackDetailModal {...defaultProps} />);

    const addButton = screen.getByText('Add').closest('button');
    if (addButton) {
      fireEvent.click(addButton);
    }
  });

  it('handles download button click', () => {
    render(<TrackDetailModal {...defaultProps} />);

    const downloadButton = screen.getByText('Download').closest('button');
    if (downloadButton) {
      fireEvent.click(downloadButton);
    }
  });

  it('renders comments section', () => {
    render(<TrackDetailModal {...defaultProps} />);

    expect(screen.getByRole('heading', { name: /Comments \(2\)/i })).toBeInTheDocument();
  });

  it('does not render when track is null', () => {
    const { container } = render(
      <TrackDetailModal {...defaultProps} track={null} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('does not render when not open', () => {
    const { container } = render(
      <TrackDetailModal {...defaultProps} isOpen={false} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('displays track duration when available', () => {
    render(<TrackDetailModal {...defaultProps} />);

    expect(screen.getAllByText(/3:00/).length).toBeGreaterThan(0);
  });

  it('renders player controls', () => {
    render(<TrackDetailModal {...defaultProps} />);

    expect(screen.getByLabelText('Previous track')).toBeInTheDocument();
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.getByLabelText('Next track')).toBeInTheDocument();
  });
});
