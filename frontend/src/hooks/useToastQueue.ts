import { useCallback, useRef, useState } from 'react';

export interface QueuedToast {
  id: string;
  tipId?: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'tip';
  title: string;
  message: string;
  amount?: number;
  timestamp: number;
}

interface ToastQueueState {
  toasts: QueuedToast[];
  visibleToasts: QueuedToast[];
}

const PRIORITY_THRESHOLD = 100;
const MAX_VISIBLE = 3;
const DRAIN_DELAY = 3000;

export function useToastQueue() {
  const [state, setState] = useState<ToastQueueState>({
    toasts: [],
    visibleToasts: [],
  });
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());

  const drainQueue = useCallback(() => {
    setState((prev) => {
      if (prev.toasts.length === 0) return prev;

      const sorted = [...prev.toasts].sort((a, b) => {
        const aPriority = (a.amount || 0) >= PRIORITY_THRESHOLD ? 1 : 0;
        const bPriority = (b.amount || 0) >= PRIORITY_THRESHOLD ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return a.timestamp - b.timestamp;
      });

      const toDisplay = sorted.slice(0, MAX_VISIBLE);
      const remaining = sorted.slice(MAX_VISIBLE);

      return {
        toasts: remaining,
        visibleToasts: toDisplay,
      };
    });

    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
    }
    drainTimerRef.current = setTimeout(() => {
      setState((prev) => {
        if (prev.toasts.length === 0) {
          return { ...prev, visibleToasts: [] };
        }
        return prev;
      });
      drainQueue();
    }, DRAIN_DELAY);
  }, []);

  const addToast = useCallback((toast: Omit<QueuedToast, 'timestamp'>) => {
    const id = toast.tipId || toast.id;
    if (pendingRef.current.has(id)) {
      return false;
    }

    pendingRef.current.add(id);
    const queuedToast: QueuedToast = {
      ...toast,
      timestamp: Date.now(),
    };

    setState((prev) => {
      const newToasts = [...prev.toasts, queuedToast];
      if (prev.visibleToasts.length < MAX_VISIBLE && prev.toasts.length === 0) {
        setTimeout(drainQueue, 0);
      }
      return { ...prev, toasts: newToasts };
    });

    return true;
  }, [drainQueue]);

  const removeToast = useCallback((id: string) => {
    pendingRef.current.delete(id);
    setState((prev) => ({
      ...prev,
      visibleToasts: prev.visibleToasts.filter((t) => t.id !== id),
    }));
    drainQueue();
  }, [drainQueue]);

  return {
    toasts: state.visibleToasts,
    addToast,
    removeToast,
  };
}