import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

// Tests that use `jest.*` APIs run under Vitest via this alias.
(globalThis as unknown as { jest: typeof vi }).jest = vi;

const createAnimationFrameStub = () =>
  vi.fn((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (!window.requestAnimationFrame) {
  Object.defineProperty(window, 'requestAnimationFrame', {
    writable: true,
    value: createAnimationFrameStub(),
  });
}

if (!window.cancelAnimationFrame) {
  Object.defineProperty(window, 'cancelAnimationFrame', {
    writable: true,
    value: vi.fn((handle: number) => window.clearTimeout(handle)),
  });
}

if (!globalThis.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
}

if (!globalThis.IntersectionObserver) {
  class IntersectionObserverMock {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly thresholds = [0];

    constructor(
      _callback: IntersectionObserverCallback,
      _options?: IntersectionObserverInit,
    ) {}

    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
}

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => tag,
    },
  ),
}));

function createSpringValue(initial: Record<string, unknown> = {}) {
  const style = {
    ...initial,
  } as Record<string, unknown> & {
    [Symbol.iterator]: () => IterableIterator<unknown>;
  };
  const api = { start: vi.fn() };

  Object.defineProperty(style, Symbol.iterator, {
    enumerable: false,
    value: function* () {
      yield style;
      yield api;
    },
  });

  return style;
}

vi.mock('react-spring', () => ({
  animated: new Proxy(
    {},
    {
      get: (_target, tag: string) => tag,
    },
  ),
  useSpring: vi.fn((input?: unknown) => {
    const seed =
      typeof input === 'function'
        ? (input as () => Record<string, unknown>)()
        : (input as Record<string, unknown> | undefined) ?? {};
    const style =
      (seed as Record<string, unknown>).to ??
      (seed as Record<string, unknown>).from ??
      seed;

    return createSpringValue(style as Record<string, unknown>);
  }),
  useTrail: vi.fn((count: number, input?: unknown) => {
    const seed =
      typeof input === 'function'
        ? (input as () => Record<string, unknown>)()
        : (input as Record<string, unknown> | undefined) ?? {};
    const style =
      (seed as Record<string, unknown>).to ??
      (seed as Record<string, unknown>).from ??
      seed;

    return Array.from({ length: count }, () =>
      createSpringValue(style as Record<string, unknown>),
    );
  }),
  useTransition: vi.fn((items: unknown) => {
    const list = Array.isArray(items) ? items : items ? [items] : [];

    return (renderItem: (style: Record<string, unknown>, item: unknown) => unknown) =>
      list.map((item) => renderItem({}, item));
  }),
}));

vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({
    ok: false,
    json: async () => ({}),
  })),
);
