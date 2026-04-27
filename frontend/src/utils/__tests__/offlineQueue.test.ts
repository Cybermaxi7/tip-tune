import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  offlineQueue,
  queueRequest,
  triggerSync,
  replayQueue,
  type QueuedAction,
} from '../offlineQueue';

// Mock IndexedDB
class IDBRequestMock {
  result: any = null;
  error: any = null;
  onsuccess: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(private _result?: any, private _error?: any) {
    setTimeout(() => {
      if (this._error) {
        this.error = this._error;
        this.onerror?.({ target: this });
      } else {
        this.result = this._result;
        this.onsuccess?.({ target: this });
      }
    }, 0);
  }
}

class IDBObjectStoreMock {
  private data = new Map<string, any>();
  private indexes = new Map<string, Map<any, any>>();

  add(value: any) {
    this.data.set(value.id, value);
    return new IDBRequestMock(value.id);
  }

  put(value: any) {
    this.data.set(value.id, value);
    return new IDBRequestMock(value.id);
  }

  get(key: string) {
    return new IDBRequestMock(this.data.get(key));
  }

  getAll() {
    return new IDBRequestMock(Array.from(this.data.values()));
  }

  delete(key: string) {
    this.data.delete(key);
    return new IDBRequestMock();
  }

  clear() {
    this.data.clear();
    return new IDBRequestMock();
  }

  createIndex(name: string, keyPath: string, options?: any) {
    this.indexes.set(name, new Map());
    return { name, keyPath, options };
  }

  index(name: string) {
    return {
      get: (key: any) => {
        const values = Array.from(this.data.values());
        const found = values.find((v) => v[name] === key);
        return new IDBRequestMock(found);
      },
      getAll: (key?: any) => {
        if (key === undefined) {
          return new IDBRequestMock(Array.from(this.data.values()));
        }
        const values = Array.from(this.data.values());
        const filtered = values.filter((v) => v[name] === key);
        return new IDBRequestMock(filtered);
      },
    };
  }
}

class IDBTransactionMock {
  private stores = new Map<string, IDBObjectStoreMock>();

  constructor(storeNames: string[]) {
    storeNames.forEach((name) => {
      if (!this.stores.has(name)) {
        this.stores.set(name, new IDBObjectStoreMock());
      }
    });
  }

  objectStore(name: string) {
    return this.stores.get(name)!;
  }
}

class IDBDatabaseMock {
  objectStoreNames = { contains: (name: string) => false };
  private stores = new Map<string, IDBObjectStoreMock>();

  transaction(storeNames: string[], mode: string) {
    return new IDBTransactionMock(storeNames);
  }

  createObjectStore(name: string, options?: any) {
    const store = new IDBObjectStoreMock();
    this.stores.set(name, store);
    return store;
  }

  close() {}
}

describe('offlineQueue', () => {
  let mockDB: IDBDatabaseMock;

  beforeEach(() => {
    // Reset the queue instance
    offlineQueue.close();

    // Mock IndexedDB
    mockDB = new IDBDatabaseMock();
    
    vi.stubGlobal('indexedDB', {
      open: vi.fn((name: string, version: number) => {
        const request = new IDBRequestMock();
        setTimeout(() => {
          request.result = mockDB;
          request.onsuccess?.({ target: request });
          
          // Trigger upgrade if needed
          const upgradeEvent = {
            target: request,
            oldVersion: 0,
            newVersion: version,
          };
          if ((request as any).onupgradeneeded) {
            (request as any).onupgradeneeded(upgradeEvent);
          }
        }, 0);
        
        (request as any).onupgradeneeded = null;
        return request;
      }),
    });
  });

  afterEach(() => {
    offlineQueue.close();
    vi.unstubAllGlobals();
  });

  describe('enqueue', () => {
    it('should enqueue an action successfully', async () => {
      const actionId = await offlineQueue.enqueue({
        url: '/api/test',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { test: 'data' },
        priority: 5,
        maxRetries: 3,
      });

      expect(actionId).toBeTruthy();
      expect(typeof actionId).toBe('string');
    });

    it('should prevent duplicate actions with same idempotency key', async () => {
      const action = {
        url: '/api/test',
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/json' },
        body: { test: 'data' },
        priority: 5,
        maxRetries: 3,
        idempotencyKey: 'unique-key-123',
      };

      const id1 = await offlineQueue.enqueue(action);
      const id2 = await offlineQueue.enqueue(action);

      expect(id1).toBe(id2);
    });

    it('should assign timestamp and retryCount to new actions', async () => {
      const actionId = await offlineQueue.enqueue({
        url: '/api/test',
        method: 'GET',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      const action = await offlineQueue.get(actionId);
      expect(action).toBeTruthy();
      expect(action!.timestamp).toBeGreaterThan(0);
      expect(action!.retryCount).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return empty array when queue is empty', async () => {
      const actions = await offlineQueue.getAll();
      expect(actions).toEqual([]);
    });

    it('should return all queued actions sorted by priority and timestamp', async () => {
      await offlineQueue.enqueue({
        url: '/api/low-priority',
        method: 'POST',
        headers: {},
        priority: 1,
        maxRetries: 3,
      });

      await offlineQueue.enqueue({
        url: '/api/high-priority',
        method: 'POST',
        headers: {},
        priority: 10,
        maxRetries: 3,
      });

      await offlineQueue.enqueue({
        url: '/api/medium-priority',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      const actions = await offlineQueue.getAll();
      expect(actions).toHaveLength(3);
      expect(actions[0].url).toBe('/api/high-priority');
      expect(actions[1].url).toBe('/api/medium-priority');
      expect(actions[2].url).toBe('/api/low-priority');
    });
  });

  describe('get', () => {
    it('should retrieve a specific action by ID', async () => {
      const actionId = await offlineQueue.enqueue({
        url: '/api/test',
        method: 'POST',
        headers: {},
        body: { test: 'data' },
        priority: 5,
        maxRetries: 3,
      });

      const action = await offlineQueue.get(actionId);
      expect(action).toBeTruthy();
      expect(action!.id).toBe(actionId);
      expect(action!.url).toBe('/api/test');
      expect(action!.body).toEqual({ test: 'data' });
    });

    it('should return null for non-existent action', async () => {
      const action = await offlineQueue.get('non-existent-id');
      expect(action).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove an action from the queue', async () => {
      const actionId = await offlineQueue.enqueue({
        url: '/api/test',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      await offlineQueue.remove(actionId);
      const action = await offlineQueue.get(actionId);
      expect(action).toBeNull();
    });
  });

  describe('incrementRetry', () => {
    it('should increment retry count for an action', async () => {
      const actionId = await offlineQueue.enqueue({
        url: '/api/test',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      await offlineQueue.incrementRetry(actionId);
      const action = await offlineQueue.get(actionId);
      expect(action!.retryCount).toBe(1);

      await offlineQueue.incrementRetry(actionId);
      const action2 = await offlineQueue.get(actionId);
      expect(action2!.retryCount).toBe(2);
    });
  });

  describe('saveReplayMetadata', () => {
    it('should save replay metadata', async () => {
      const actionId = await offlineQueue.enqueue({
        url: '/api/test',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      await offlineQueue.saveReplayMetadata({
        actionId,
        attemptedAt: Date.now(),
        success: true,
        statusCode: 200,
      });

      const history = await offlineQueue.getReplayHistory(actionId);
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(true);
      expect(history[0].statusCode).toBe(200);
    });
  });

  describe('getReplayHistory', () => {
    it('should return replay history sorted by attemptedAt', async () => {
      const actionId = await offlineQueue.enqueue({
        url: '/api/test',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      const time1 = Date.now();
      await offlineQueue.saveReplayMetadata({
        actionId,
        attemptedAt: time1,
        success: false,
        error: 'Network error',
      });

      const time2 = time1 + 1000;
      await offlineQueue.saveReplayMetadata({
        actionId,
        attemptedAt: time2,
        success: true,
        statusCode: 200,
      });

      const history = await offlineQueue.getReplayHistory(actionId);
      expect(history).toHaveLength(2);
      expect(history[0].attemptedAt).toBe(time1);
      expect(history[1].attemptedAt).toBe(time2);
    });
  });

  describe('getStats', () => {
    it('should return correct queue statistics', async () => {
      await offlineQueue.enqueue({
        url: '/api/test1',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      await offlineQueue.enqueue({
        url: '/api/test2',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      const stats = await offlineQueue.getStats();
      expect(stats.totalQueued).toBe(2);
      expect(stats.oldestAction).toBeGreaterThan(0);
      expect(stats.newestAction).toBeGreaterThan(0);
    });
  });

  describe('clearQueue', () => {
    it('should clear all queued actions', async () => {
      await offlineQueue.enqueue({
        url: '/api/test1',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      await offlineQueue.enqueue({
        url: '/api/test2',
        method: 'POST',
        headers: {},
        priority: 5,
        maxRetries: 3,
      });

      await offlineQueue.clearQueue();
      const actions = await offlineQueue.getAll();
      expect(actions).toHaveLength(0);
    });
  });
});

describe('queueRequest', () => {
  beforeEach(() => {
    offlineQueue.close();
    const mockDB = new IDBDatabaseMock();
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const request = new IDBRequestMock();
        setTimeout(() => {
          request.result = mockDB;
          request.onsuccess?.({ target: request });
        }, 0);
        return request;
      }),
    });
  });

  afterEach(() => {
    offlineQueue.close();
    vi.unstubAllGlobals();
  });

  it('should queue a request with default options', async () => {
    const actionId = await queueRequest('/api/test');
    expect(actionId).toBeTruthy();
  });

  it('should queue a request with custom options', async () => {
    const actionId = await queueRequest('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
      priority: 10,
      maxRetries: 5,
      idempotencyKey: 'test-key',
      metadata: { source: 'test' },
    });

    const action = await offlineQueue.get(actionId);
    expect(action).toBeTruthy();
    expect(action!.method).toBe('POST');
    expect(action!.priority).toBe(10);
    expect(action!.maxRetries).toBe(5);
    expect(action!.idempotencyKey).toBe('test-key');
    expect(action!.metadata).toEqual({ source: 'test' });
  });
});

describe('replayQueue', () => {
  beforeEach(() => {
    offlineQueue.close();
    const mockDB = new IDBDatabaseMock();
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        const request = new IDBRequestMock();
        setTimeout(() => {
          request.result = mockDB;
          request.onsuccess?.({ target: request });
        }, 0);
        return request;
      }),
    });

    // Mock fetch
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    offlineQueue.close();
    vi.unstubAllGlobals();
  });

  it('should replay successful actions and remove them from queue', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    } as Response);

    await offlineQueue.enqueue({
      url: '/api/test',
      method: 'POST',
      headers: {},
      priority: 5,
      maxRetries: 3,
    });

    const result = await replayQueue();
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    const actions = await offlineQueue.getAll();
    expect(actions).toHaveLength(0);
  });

  it('should handle failed actions and increment retry count', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValue(new Error('Network error'));

    const actionId = await offlineQueue.enqueue({
      url: '/api/test',
      method: 'POST',
      headers: {},
      priority: 5,
      maxRetries: 3,
    });

    const result = await replayQueue();
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);

    const action = await offlineQueue.get(actionId);
    expect(action!.retryCount).toBe(1);
  });

  it('should remove actions that exceed max retries', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValue(new Error('Network error'));

    const actionId = await offlineQueue.enqueue({
      url: '/api/test',
      method: 'POST',
      headers: {},
      priority: 5,
      maxRetries: 1,
    });

    // First attempt
    await replayQueue();
    let action = await offlineQueue.get(actionId);
    expect(action).toBeTruthy();
    expect(action!.retryCount).toBe(1);

    // Second attempt - should remove
    await replayQueue();
    action = await offlineQueue.get(actionId);
    expect(action).toBeNull();
  });

  it('should handle HTTP errors correctly', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Bad request' }),
    } as Response);

    await offlineQueue.enqueue({
      url: '/api/test',
      method: 'POST',
      headers: {},
      priority: 5,
      maxRetries: 3,
    });

    const result = await replayQueue();
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.errors[0].error).toContain('HTTP 400');
  });
});

describe('triggerSync', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          sync: {
            register: vi.fn().mockResolvedValue(undefined),
          },
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should register background sync when supported', async () => {
    await triggerSync('test-tag');
    const registration = await navigator.serviceWorker.ready;
    expect(registration.sync.register).toHaveBeenCalledWith('test-tag');
  });
});
