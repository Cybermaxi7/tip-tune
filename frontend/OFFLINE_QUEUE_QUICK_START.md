# Offline Queue Quick Start

## 🚀 5-Minute Integration Guide

### Step 1: Import the utilities

```typescript
import {
  queueOfflineRequest,
  setupOnlineOfflineListeners,
  isOnline,
} from '@/utils/serviceWorker';
```

### Step 2: Initialize in your app

```typescript
// In your main App.tsx or index.tsx
import { registerServiceWorker, setupOnlineOfflineListeners } from '@/utils/serviceWorker';

// On app startup
async function initApp() {
  // Register service worker
  await registerServiceWorker();
  
  // Set up online/offline listeners
  setupOnlineOfflineListeners(
    () => console.log('Back online!'),
    () => console.log('Gone offline!')
  );
}

initApp();
```

### Step 3: Wrap your API calls

```typescript
// Before (no offline support)
async function sendTip(artistId: string, amount: number) {
  return apiClient.post('/api/tips', { artistId, amount });
}

// After (with offline support)
async function sendTip(artistId: string, amount: number) {
  if (isOnline()) {
    try {
      return await apiClient.post('/api/tips', { artistId, amount });
    } catch (error) {
      // Queue on network error
      await queueOfflineRequest('/api/tips', {
        method: 'POST',
        body: JSON.stringify({ artistId, amount }),
        priority: 10,
        maxRetries: 5,
        idempotencyKey: `tip-${artistId}-${Date.now()}`,
      });
      return { queued: true };
    }
  } else {
    // Queue immediately when offline
    await queueOfflineRequest('/api/tips', {
      method: 'POST',
      body: JSON.stringify({ artistId, amount }),
      priority: 10,
      maxRetries: 5,
      idempotencyKey: `tip-${artistId}-${Date.now()}`,
    });
    return { queued: true };
  }
}
```

### Step 4: Show queue status in UI

```typescript
import { getQueueStats } from '@/utils/serviceWorker';

function QueueStatus() {
  const [stats, setStats] = React.useState(null);
  
  React.useEffect(() => {
    getQueueStats().then(setStats);
    
    // Refresh on sync events
    const refresh = () => getQueueStats().then(setStats);
    window.addEventListener('offline-sync-success', refresh);
    window.addEventListener('offline-sync-failed', refresh);
    
    return () => {
      window.removeEventListener('offline-sync-success', refresh);
      window.removeEventListener('offline-sync-failed', refresh);
    };
  }, []);
  
  if (!stats || stats.totalQueued === 0) return null;
  
  return (
    <div className="queue-status">
      📤 {stats.totalQueued} action(s) queued
    </div>
  );
}
```

## 📋 Common Patterns

### Pattern 1: High-Priority Action (Tips, Purchases)

```typescript
await queueOfflineRequest('/api/tips', {
  method: 'POST',
  body: JSON.stringify({ artistId, amount }),
  priority: 10,           // Highest priority
  maxRetries: 5,          // More retries
  idempotencyKey: `tip-${artistId}-${Date.now()}`,
});
```

### Pattern 2: Medium-Priority Action (Playlists, Comments)

```typescript
await queueOfflineRequest('/api/playlists', {
  method: 'POST',
  body: JSON.stringify({ name, trackIds }),
  priority: 5,            // Medium priority
  maxRetries: 3,          // Standard retries
  idempotencyKey: `playlist-${name}-${Date.now()}`,
});
```

### Pattern 3: Low-Priority Action (Analytics, Tracking)

```typescript
await queueOfflineRequest('/api/plays/record', {
  method: 'POST',
  body: JSON.stringify({ trackId, userId }),
  priority: 1,            // Low priority
  maxRetries: 2,          // Fewer retries
  idempotencyKey: `play-${trackId}-${userId}-${Date.now()}`,
});
```

## 🎯 Priority Levels

| Priority | Use Case | Examples |
|----------|----------|----------|
| 10 | Critical user actions | Tips, purchases, payments |
| 7-9 | Important content | Playlist creation, comments, posts |
| 4-6 | Standard interactions | Likes, follows, shares |
| 1-3 | Analytics & tracking | Play counts, view events, telemetry |

## 🔑 Idempotency Keys

**Always use idempotency keys** to prevent duplicate actions:

```typescript
// ✅ Good patterns
`tip-${artistId}-${timestamp}`
`playlist-${userId}-${playlistName}-${timestamp}`
`comment-${trackId}-${userId}-${timestamp}`
`like-${trackId}-${userId}`

// ❌ Bad patterns
Math.random().toString()  // Not deterministic
userId                    // Too broad
```

## 🎨 UI Feedback

### Show Offline Indicator

```typescript
import { isOnline } from '@/utils/serviceWorker';

function OfflineIndicator() {
  const [online, setOnline] = React.useState(isOnline());
  
  React.useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  if (online) return null;
  
  return (
    <div className="offline-banner">
      🔴 You're offline. Actions will sync when reconnected.
    </div>
  );
}
```

### Show Success/Failure Toasts

```typescript
import { toast } from 'react-toastify';

// Listen for sync events
window.addEventListener('offline-sync-success', (event: CustomEvent) => {
  toast.success(`Action synced: ${event.detail.method} ${event.detail.url}`);
});

window.addEventListener('offline-sync-failed', (event: CustomEvent) => {
  if (event.detail.permanent) {
    toast.error(`Action failed permanently: ${event.detail.error}`);
  } else {
    toast.warning(`Action failed, will retry (${event.detail.retryCount})`);
  }
});
```

## 🧪 Testing

### Test Offline Behavior

1. Open DevTools → Network → Set to "Offline"
2. Perform an action
3. Check DevTools → Application → IndexedDB → TipTuneOfflineQueue
4. Verify action is queued
5. Set Network back to "Online"
6. Verify action is replayed

### Test in Console

```javascript
// Check queue status
import { getQueueStats } from './src/utils/serviceWorker';
const stats = await getQueueStats();
console.log(stats);

// View queued actions
import { getQueuedActions } from './src/utils/serviceWorker';
const actions = await getQueuedActions();
console.log(actions);

// Manual sync
import { manualReplayQueue } from './src/utils/serviceWorker';
const result = await manualReplayQueue();
console.log(result);
```

## 🐛 Troubleshooting

### Actions not syncing?

```javascript
// Check if service worker is registered
navigator.serviceWorker.getRegistration().then(console.log);

// Check if background sync is supported
import { isBackgroundSyncSupported } from './src/utils/serviceWorker';
console.log('Sync supported:', isBackgroundSyncSupported());

// Manually trigger sync
import { manualReplayQueue } from './src/utils/serviceWorker';
manualReplayQueue().then(console.log);
```

### Duplicate actions?

- Ensure idempotency keys are unique per action
- Check server-side idempotency handling
- Verify actions are removed after successful replay

### Service worker not updating?

```javascript
// Unregister and refresh
navigator.serviceWorker.getRegistrations().then(regs => 
  regs.forEach(reg => reg.unregister())
);
// Then hard refresh (Ctrl+Shift+R)
```

## 📚 Full Documentation

For complete documentation, see:
- [OFFLINE_QUEUE_GUIDE.md](./OFFLINE_QUEUE_GUIDE.md) - Complete guide
- [OFFLINE_QUEUE_VALIDATION.md](./OFFLINE_QUEUE_VALIDATION.md) - Testing checklist
- [offlineQueueIntegration.example.ts](./src/utils/offlineQueueIntegration.example.ts) - Code examples

## 🎉 You're Done!

Your app now supports offline actions with automatic sync. Users can continue using the app even without a connection, and their actions will be replayed when they're back online.
