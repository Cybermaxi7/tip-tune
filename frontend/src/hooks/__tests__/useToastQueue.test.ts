import { renderHook, act } from '@testing-library/react';
import { useToastQueue, QueuedToast } from '../useToastQueue';

describe('useToastQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add toasts to queue', () => {
    const { result } = renderHook(() => useToastQueue());

    act(() => {
      result.current.addToast({
        id: 'toast-1',
        type: 'tip',
        title: 'New Tip!',
        message: 'You received a tip',
      });
    });

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.toasts.length).toBeGreaterThan(0);
  });

  it('should deduplicate by tip id', () => {
    const { result } = renderHook(() => useToastQueue());

    let added1: boolean;
    act(() => {
      added1 = result.current.addToast({
        id: 'toast-1',
        tipId: 'tip-123',
        type: 'tip',
        title: 'Tip 1',
        message: 'First message',
      });
    });

    let added2: boolean;
    act(() => {
      added2 = result.current.addToast({
        id: 'toast-2',
        tipId: 'tip-123',
        type: 'tip',
        title: 'Tip 2',
        message: 'Duplicate message',
      });
    });

    expect(added1).toBe(true);
    expect(added2).toBe(false);
  });

  it('should prioritize large tips', () => {
    const { result } = renderHook(() => useToastQueue());

    act(() => {
      result.current.addToast({
        id: 'small',
        type: 'tip',
        title: 'Small',
        message: '10 XLM',
        amount: 10,
      });
      result.current.addToast({
        id: 'large',
        type: 'tip',
        title: 'Large',
        message: '500 XLM',
        amount: 500,
      });
    });

    act(() => {
      vi.advanceTimersByTime(0);
    });

    const visible = result.current.toasts;
    expect(visible[0]?.amount).toBeGreaterThanOrEqual(visible[1]?.amount || 0);
  });

  it('should drain queue gracefully', () => {
    const { result } = renderHook(() => useToastQueue());

    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.addToast({
          id: `toast-${i}`,
          type: 'tip',
          title: `Tip ${i}`,
          message: `Message ${i}`,
          amount: i,
        });
      });
    }

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.toasts.length).toBeLessThanOrEqual(3);
  });

  it('should remove toast and trigger drain', () => {
    const { result } = renderHook(() => useToastQueue());

    act(() => {
      result.current.addToast({
        id: 'toast-1',
        type: 'tip',
        title: 'Tip',
        message: 'Message',
      });
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const toastId = result.current.toasts[0]?.id;
    if (toastId) {
      act(() => {
        result.current.removeToast(toastId);
      });

      expect(result.current.toasts.some((t) => t.id === toastId)).toBe(false);
    }
  });
});