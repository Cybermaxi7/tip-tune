/* Offline Queue Manager using IndexedDB
 * Handles deferred actions when offline with replay policies and duplicate protection.
 * Designed to work with service worker background sync.
 */

const DB_NAME = 'TipTuneOfflineQueue';
const DB_VERSION = 1;
const QUEUE_STORE = 'queue';
const METADATA_STORE = 'metadata';

export interface QueuedAction {
  id: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority: number; // Higher = more important
  idempotencyKey?: string; // For duplicate protection
  metadata?: Record<string, any>; // App-specific data
}

export interface ReplayMetadata {
  id: string;
  actionId: string;
  attemptedAt: number;
  success: boolean;
  error?: string;
  statusCode?: number;
  responseData?: any;
}

export interface QueueStats {
  totalQueued: number;
  totalFailed: number;
  totalSucceeded: number;
  oldestAction?: number;
  newestAction?: number;
}

class OfflineQueueManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Queue store for pending actions
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
          queueStore.createIndex('priority', 'priority', { unique: false });
          queueStore.createIndex('idempotencyKey', 'idempotencyKey', { unique: false });
        }

        // Metadata store for replay history
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
          metadataStore.createIndex('actionId', 'actionId', { unique: false });
          metadataStore.createIndex('attemptedAt', 'attemptedAt', { unique: false });
          metadataStore.createIndex('success', 'success', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Enqueue an action for later replay
   */
  async enqueue(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    // Check for duplicate based on idempotencyKey
    if (action.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(action.idempotencyKey);
      if (existing) {
        console.log(`Action with idempotency key ${action.idempotencyKey} already queued`);
        return existing.id;
      }
    }

    const queuedAction: QueuedAction = {
      ...action,
      id: this.generateId(),
      timestamp: Date.now(),
      retryCount: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.add(queuedAction);

      request.onsuccess = () => {
        console.log(`Queued action ${queuedAction.id} for ${queuedAction.url}`);
        resolve(queuedAction.id);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all queued actions, sorted by priority (desc) then timestamp (asc)
   */
  async getAll(): Promise<QueuedAction[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readonly');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const actions = request.result as QueuedAction[];
        // Sort by priority (desc) then timestamp (asc)
        actions.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.timestamp - b.timestamp;
        });
        resolve(actions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a specific action by ID
   */
  async get(id: string): Promise<QueuedAction | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readonly');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Find action by idempotency key
   */
  async findByIdempotencyKey(key: string): Promise<QueuedAction | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readonly');
      const store = transaction.objectStore(QUEUE_STORE);
      const index = store.index('idempotencyKey');
      const request = index.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove an action from the queue
   */
  async remove(id: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`Removed action ${id} from queue`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update retry count for an action
   */
  async incrementRetry(id: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const action = await this.get(id);
    if (!action) throw new Error(`Action ${id} not found`);

    action.retryCount++;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.put(action);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save replay metadata
   */
  async saveReplayMetadata(metadata: Omit<ReplayMetadata, 'id'>): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const record: ReplayMetadata = {
      ...metadata,
      id: this.generateId(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.add(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get replay history for an action
   */
  async getReplayHistory(actionId: string): Promise<ReplayMetadata[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const index = store.index('actionId');
      const request = index.getAll(actionId);

      request.onsuccess = () => {
        const records = request.result as ReplayMetadata[];
        records.sort((a, b) => a.attemptedAt - b.attemptedAt);
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const [queuedActions, allMetadata] = await Promise.all([
      this.getAll(),
      this.getAllMetadata(),
    ]);

    const failed = allMetadata.filter((m) => !m.success).length;
    const succeeded = allMetadata.filter((m) => m.success).length;

    const timestamps = queuedActions.map((a) => a.timestamp);
    const oldest = timestamps.length > 0 ? Math.min(...timestamps) : undefined;
    const newest = timestamps.length > 0 ? Math.max(...timestamps) : undefined;

    return {
      totalQueued: queuedActions.length,
      totalFailed: failed,
      totalSucceeded: succeeded,
      oldestAction: oldest,
      newestAction: newest,
    };
  }

  /**
   * Get all replay metadata
   */
  private async getAllMetadata(): Promise<ReplayMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as ReplayMetadata[]);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear old metadata (keep last 100 records per action)
   */
  async pruneMetadata(keepPerAction = 100): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const allMetadata = await this.getAllMetadata();
    const byAction = new Map<string, ReplayMetadata[]>();

    // Group by actionId
    for (const meta of allMetadata) {
      if (!byAction.has(meta.actionId)) {
        byAction.set(meta.actionId, []);
      }
      byAction.get(meta.actionId)!.push(meta);
    }

    // For each action, keep only the most recent N records
    const toDelete: string[] = [];
    for (const [, records] of byAction) {
      records.sort((a, b) => b.attemptedAt - a.attemptedAt);
      if (records.length > keepPerAction) {
        toDelete.push(...records.slice(keepPerAction).map((r) => r.id));
      }
    }

    if (toDelete.length === 0) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);

      let completed = 0;
      for (const id of toDelete) {
        const request = store.delete(id);
        request.onsuccess = () => {
          completed++;
          if (completed === toDelete.length) {
            console.log(`Pruned ${toDelete.length} old metadata records`);
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      }
    });
  }

  /**
   * Clear all queued actions (use with caution)
   */
  async clearQueue(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Queue cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all metadata (use with caution)
   */
  async clearMetadata(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Metadata cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Singleton instance
export const offlineQueue = new OfflineQueueManager();

/**
 * Helper function to queue a fetch request
 */
export async function queueRequest(
  url: string,
  options: RequestInit & {
    priority?: number;
    maxRetries?: number;
    idempotencyKey?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<string> {
  const {
    method = 'GET',
    headers = {},
    body,
    priority = 5,
    maxRetries = 3,
    idempotencyKey,
    metadata,
  } = options;

  return offlineQueue.enqueue({
    url,
    method: method as QueuedAction['method'],
    headers: headers as Record<string, string>,
    body: body ? (typeof body === 'string' ? JSON.parse(body) : body) : undefined,
    priority,
    maxRetries,
    idempotencyKey,
    metadata,
  });
}

/**
 * Trigger background sync (if supported)
 */
export async function triggerSync(tag = 'offline-replay'): Promise<void> {
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register(tag);
      console.log(`Background sync registered: ${tag}`);
    } catch (error) {
      console.warn('Background sync registration failed:', error);
      // Fallback: attempt immediate replay
      await replayQueue();
    }
  } else {
    console.warn('Background sync not supported, attempting immediate replay');
    await replayQueue();
  }
}

/**
 * Manually replay the queue (can be called from UI or service worker)
 */
export async function replayQueue(): Promise<{
  succeeded: string[];
  failed: string[];
  errors: Array<{ id: string; error: string }>;
}> {
  const actions = await offlineQueue.getAll();
  const succeeded: string[] = [];
  const failed: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  console.log(`Replaying ${actions.length} queued actions`);

  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body ? JSON.stringify(action.body) : undefined,
      });

      const responseData = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text();

      if (response.ok) {
        // Success
        await offlineQueue.saveReplayMetadata({
          actionId: action.id,
          attemptedAt: Date.now(),
          success: true,
          statusCode: response.status,
          responseData,
        });
        await offlineQueue.remove(action.id);
        succeeded.push(action.id);
        console.log(`Successfully replayed action ${action.id}`);
      } else {
        // HTTP error
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
      }
    } catch (error) {
      // Network or other error
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to replay action ${action.id}:`, errorMessage);

      await offlineQueue.incrementRetry(action.id);
      await offlineQueue.saveReplayMetadata({
        actionId: action.id,
        attemptedAt: Date.now(),
        success: false,
        error: errorMessage,
      });

      // Check if max retries exceeded
      const updatedAction = await offlineQueue.get(action.id);
      if (updatedAction && updatedAction.retryCount >= updatedAction.maxRetries) {
        console.error(`Action ${action.id} exceeded max retries, removing from queue`);
        await offlineQueue.remove(action.id);
      }

      failed.push(action.id);
      errors.push({ id: action.id, error: errorMessage });
    }
  }

  console.log(`Replay complete: ${succeeded.length} succeeded, ${failed.length} failed`);
  return { succeeded, failed, errors };
}

export default offlineQueue;
