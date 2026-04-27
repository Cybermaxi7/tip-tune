/* TipTune service worker using Workbox CDN for pragmatic integration.
   This file lives in public/ and is registered from the client.
   It handles precaching (simple), runtime caching for audio/images/APIs,
   push notifications, background sync, and media controls.
*/
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  // Force production-level logs to warn and above
  workbox.setConfig({debug: false});

  // Precache: the build process may inject a precache manifest if configured.
  // We still provide a fallback for the root and assets referenced here.
  workbox.precaching.precacheAndRoute([
    {url: '/', revision: null},
    {url: '/index.html', revision: null}
  ]);

  // Navigation route (SPA fallback)
  workbox.routing.registerNavigationRoute('/');

  // Runtime caching: API JSON responses (NetworkFirst)
  workbox.routing.registerRoute(
    ({url}) => url.pathname.startsWith('/api/') || url.pathname.includes('/uploads/'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'api-cache',
      networkTimeoutSeconds: 10,
      plugins: [new workbox.expiration.ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 24 * 60 * 60})]
    })
  );

  // Images (CacheFirst)
  workbox.routing.registerRoute(
    ({request}) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'image-cache',
      plugins: [new workbox.expiration.ExpirationPlugin({maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60})]
    })
  );

  // Audio/media files: CacheFirst with Range request support if present
  // Note: Workbox doesn't fully polyfill Range support; fallback to cache network strategy.
  workbox.routing.registerRoute(
    ({request}) => request.destination === 'audio' || request.url.match(/\.(mp3|m4a|ogg|wav)$/),
    new workbox.strategies.CacheFirst({
      cacheName: 'audio-cache',
      plugins: [new workbox.expiration.ExpirationPlugin({maxEntries: 100, maxAgeSeconds: 60 * 24 * 60 * 60})]
    })
  );

  // Fallback offline page for navigation requests
  workbox.routing.setCatchHandler(async ({event}) => {
    if (event.request.destination === 'document') {
      return caches.match('/index.html');
    }
    return Response.error();
  });
}

// Push notifications handler
self.addEventListener('push', function (event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {title: 'TipTune', body: 'New notification'};
  } catch (e) {
    payload = {title: 'TipTune', body: event.data ? event.data.text() : 'New notification'};
  }

  const title = payload.title || 'TipTune';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || {},
    vibrate: [100, 50, 100]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  
  // Determine target URL based on notification data
  let url = '/';
  const data = event.notification.data || {};
  
  if (data.url) {
    url = data.url;
  } else if (data.type === 'sync-failure' || data.type === 'sync-success') {
    // Route to a sync status page or settings
    url = '/settings?tab=sync';
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Check if there's already a window open with this URL
      for (let client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // If no matching window, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync: real implementation with IndexedDB queue replay
let isReplaying = false; // Prevent concurrent replays

self.addEventListener('sync', function (event) {
  if (event.tag === 'offline-replay' || event.tag === 'retry-uploads') {
    event.waitUntil(replayOfflineQueue());
  }
});

/**
 * Replay queued actions from IndexedDB
 */
async function replayOfflineQueue() {
  // Prevent concurrent replays
  if (isReplaying) {
    console.log('[SW] Replay already in progress, skipping');
    return;
  }
  
  isReplaying = true;
  
  const DB_NAME = 'TipTuneOfflineQueue';
  const QUEUE_STORE = 'queue';
  const METADATA_STORE = 'metadata';

  try {
    // Open IndexedDB
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      
      // Handle database upgrade (create stores if they don't exist)
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create queue store if it doesn't exist
        if (!db.objectStoreNames.contains('queue')) {
          const queueStore = db.createObjectStore('queue', { keyPath: 'id' });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
          queueStore.createIndex('priority', 'priority', { unique: false });
          queueStore.createIndex('idempotencyKey', 'idempotencyKey', { unique: false });
        }
        
        // Create metadata store if it doesn't exist
        if (!db.objectStoreNames.contains('metadata')) {
          const metadataStore = db.createObjectStore('metadata', { keyPath: 'id' });
          metadataStore.createIndex('actionId', 'actionId', { unique: false });
          metadataStore.createIndex('attemptedAt', 'attemptedAt', { unique: false });
          metadataStore.createIndex('success', 'success', { unique: false });
        }
      };
    });

    // Get all queued actions
    const actions = await new Promise((resolve, reject) => {
      const transaction = db.transaction([QUEUE_STORE], 'readonly');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Sort by priority (desc) then timestamp (asc)
    actions.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.timestamp - b.timestamp;
    });

    console.log(`[SW] Replaying ${actions.length} queued actions`);

    const results = { succeeded: 0, failed: 0 };

    // Replay each action
    for (const action of actions) {
      try {
        // Add timeout to fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        
        try {
          const response = await fetch(action.url, {
            method: action.method,
            headers: action.headers,
            body: action.body ? JSON.stringify(action.body) : undefined,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          const responseData = response.headers.get('content-type')?.includes('application/json')
            ? await response.json()
            : await response.text();

          if (response.ok) {
            // Success - save metadata and remove from queue
            await saveMetadata(db, {
              actionId: action.id,
              attemptedAt: Date.now(),
              success: true,
              statusCode: response.status,
              responseData,
            });
            await removeFromQueue(db, action.id);
            results.succeeded++;
            console.log(`[SW] Successfully replayed action ${action.id}`);

            // Notify clients of success
            await notifyClients({
              type: 'SYNC_SUCCESS',
              actionId: action.id,
              url: action.url,
              method: action.method,
            });
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        // Failure - increment retry count and save metadata
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[SW] Failed to replay action ${action.id}:`, errorMessage);

        action.retryCount = (action.retryCount || 0) + 1;

        await saveMetadata(db, {
          actionId: action.id,
          attemptedAt: Date.now(),
          success: false,
          error: errorMessage,
        });

        // Check if max retries exceeded
        if (action.retryCount >= action.maxRetries) {
          console.error(`[SW] Action ${action.id} exceeded max retries, removing from queue`);
          await removeFromQueue(db, action.id);

          // Notify clients of permanent failure
          await notifyClients({
            type: 'SYNC_FAILED',
            actionId: action.id,
            url: action.url,
            method: action.method,
            error: errorMessage,
            permanent: true,
          });
        } else {
          // Update retry count
          await updateAction(db, action);

          // Notify clients of temporary failure
          await notifyClients({
            type: 'SYNC_FAILED',
            actionId: action.id,
            url: action.url,
            method: action.method,
            error: errorMessage,
            permanent: false,
            retryCount: action.retryCount,
          });
        }

        results.failed++;
      }
    }

    db.close();
    console.log(`[SW] Replay complete: ${results.succeeded} succeeded, ${results.failed} failed`);

    // Show notification if there were failures
    if (results.failed > 0 && results.succeeded === 0) {
      await self.registration.showNotification('Sync Failed', {
        body: `${results.failed} action(s) could not be synced. Please check your connection.`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'sync-failure',
        data: { type: 'sync-failure', count: results.failed },
      });
    } else if (results.succeeded > 0) {
      await self.registration.showNotification('Sync Complete', {
        body: `${results.succeeded} action(s) synced successfully.`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'sync-success',
        data: { type: 'sync-success', count: results.succeeded },
      });
    }
  } catch (error) {
    console.error('[SW] Error during queue replay:', error);
    throw error;
  } finally {
    isReplaying = false;
  }
}

/**
 * Save replay metadata to IndexedDB
 */
async function saveMetadata(db, metadata) {
  const METADATA_STORE = 'metadata';
  const record = {
    ...metadata,
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.add(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove action from queue
 */
async function removeFromQueue(db, actionId) {
  const QUEUE_STORE = 'queue';
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);
    const request = store.delete(actionId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update action in queue (e.g., increment retry count)
 */
async function updateAction(db, action) {
  const QUEUE_STORE = 'queue';
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);
    const request = store.put(action);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Notify all clients about sync events
 */
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// Media Session API integration from service worker messages
self.addEventListener('message', (event) => {
  // Accept messages from the client to set the media session metadata/actions
  if (!event.data) return;
  const {type, payload} = event.data;
  if (type === 'MEDIA_SESSION') {
    // forward to clients (no direct mediaSession in SW), or respond to client
    // Client will handle actual MediaSession API; SW can be used for notification actions
  }
});
