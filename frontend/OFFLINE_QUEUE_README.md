# TipTune PWA Offline Queue System

> A robust, production-ready offline queue implementation for Progressive Web Apps

## 🎯 What is this?

The TipTune PWA Offline Queue System allows users to continue using the app even when offline. Actions are automatically queued in IndexedDB and replayed when the connection is restored.

## ✨ Features

- 🔄 **Automatic Sync**: Actions replay automatically when network is restored
- 📦 **Persistent Storage**: Queue survives page reloads using IndexedDB
- 🎯 **Priority Queue**: Critical actions (tips, purchases) replay before analytics
- 🛡️ **Duplicate Protection**: Idempotency keys prevent duplicate actions
- 🔁 **Retry Logic**: Configurable max retries with automatic cleanup
- 📊 **Replay History**: Full audit trail of replay attempts
- 🔔 **UI Notifications**: Service worker shows sync status
- 🎨 **Event System**: Custom events for UI integration
- 🌐 **Browser Support**: Works in all modern browsers with graceful degradation

## 🚀 Quick Start

### 1. Initialize in your app

```typescript
import { registerServiceWorker, setupOnlineOfflineListeners } from '@/utils/serviceWorker';

// On app startup
await registerServiceWorker();
setupOnlineOfflineListeners(
  () => console.log('Back online!'),
  () => console.log('Gone offline!')
);
```

### 2. Wrap your API calls

```typescript
import { queueOfflineRequest, isOnline } from '@/utils/serviceWorker';

async function sendTip(artistId: string, amount: number) {
  const url = '/api/tips';
  const body = { artistId, amount };
  
  if (isOnline()) {
    try {
      return await apiClient.post(url, body);
    } catch (error) {
      // Queue on network error
      await queueOfflineRequest(url, {
        method: 'POST',
        body: JSON.stringify(body),
        priority: 10,
        maxRetries: 5,
        idempotencyKey: `tip-${artistId}-${Date.now()}`
      });
      return { queued: true };
    }
  } else {
    // Queue immediately when offline
    await queueOfflineRequest(url, {
      method: 'POST',
      body: JSON.stringify(body),
      priority: 10,
      maxRetries: 5,
      idempotencyKey: `tip-${artistId}-${Date.now()}`
    });
    return { queued: true };
  }
}
```

### 3. Show queue status

```typescript
import { getQueueStats } from '@/utils/serviceWorker';

function QueueStatus() {
  const [stats, setStats] = React.useState(null);
  
  React.useEffect(() => {
    getQueueStats().then(setStats);
  }, []);
  
  if (!stats || stats.totalQueued === 0) return null;
  
  return <div>📤 {stats.totalQueued} action(s) queued</div>;
}
```

## 📚 Documentation

### Getting Started
- **[Quick Start Guide](./OFFLINE_QUEUE_QUICK_START.md)** - 5-minute integration guide
- **[Implementation Guide](./OFFLINE_QUEUE_GUIDE.md)** - Complete documentation
- **[Integration Examples](./src/utils/offlineQueueIntegration.example.ts)** - Real-world patterns

### Testing & Validation
- **[Validation Checklist](./OFFLINE_QUEUE_VALIDATION.md)** - Step-by-step validation
- **[Unit Tests](./src/utils/__tests__/offlineQueue.test.ts)** - 20 comprehensive tests

### Reference
- **[Implementation Summary](./OFFLINE_QUEUE_IMPLEMENTATION_SUMMARY.md)** - Technical overview
- **[PR Summary](../OFFLINE_QUEUE_PR_SUMMARY.md)** - Change summary

## 🏗️ Architecture

```
User Action (Offline)
    ↓
Queue in IndexedDB
    ↓
Register Background Sync
    ↓
Network Restored
    ↓
Service Worker Replays Queue
    ↓
Notify App of Success/Failure
    ↓
UI Updates
```

### Components

1. **offlineQueue.ts** - Core queue manager
   - IndexedDB operations
   - Queue CRUD
   - Metadata persistence

2. **sw.js** - Service worker
   - Background sync listener
   - Queue replay logic
   - Client notifications

3. **serviceWorker.ts** - Integration layer
   - Queue utilities
   - Event listeners
   - Helper functions

## 🎯 Priority Levels

| Priority | Use Case | Examples |
|----------|----------|----------|
| 10 | Critical user actions | Tips, purchases, payments |
| 7-9 | Important content | Playlist creation, comments |
| 4-6 | Standard interactions | Likes, follows, shares |
| 1-3 | Analytics & tracking | Play counts, view events |

## 🔑 Idempotency Keys

Always use idempotency keys to prevent duplicate actions:

```typescript
// ✅ Good patterns
`tip-${artistId}-${timestamp}`
`playlist-${userId}-${name}-${timestamp}`
`comment-${trackId}-${userId}-${timestamp}`

// ❌ Bad patterns
Math.random().toString()  // Not deterministic
userId                    // Too broad
```

## 🧪 Testing

### Run Unit Tests

```bash
cd frontend
npm test -- offlineQueue.test.ts
```

### Browser Testing

1. Open DevTools → Network → Set to "Offline"
2. Perform an action (e.g., send tip)
3. Check DevTools → Application → IndexedDB → TipTuneOfflineQueue
4. Verify action is queued
5. Set Network back to "Online"
6. Verify action is replayed

## 🌐 Browser Support

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| IndexedDB | ✅ | ✅ | ✅ |
| Background Sync | ✅ | ❌* | ❌* |
| Service Worker | ✅ | ✅ | ✅ |

*Falls back to manual replay when online/offline events fire

## 📊 API Reference

### Queue Management

```typescript
// Queue a request
const actionId = await queueOfflineRequest(url, options);

// Get queue statistics
const stats = await getQueueStats();
// { totalQueued, totalFailed, totalSucceeded, oldestAction, newestAction }

// Get all queued actions
const actions = await getQueuedActions();

// Clear a specific action
await clearQueuedAction(actionId);

// Clear all actions
await clearAllQueuedActions();

// Get replay history
const history = await getReplayHistory(actionId);
```

### Event Listeners

```typescript
// Listen for sync success
window.addEventListener('offline-sync-success', (event) => {
  console.log('Synced:', event.detail);
});

// Listen for sync failure
window.addEventListener('offline-sync-failed', (event) => {
  console.error('Failed:', event.detail);
});

// Set up online/offline listeners
const cleanup = setupOnlineOfflineListeners(
  () => console.log('Online'),
  () => console.log('Offline')
);
```

### Utilities

```typescript
// Check if background sync is supported
const supported = isBackgroundSyncSupported();

// Check if currently online
const online = isOnline();

// Manually trigger replay
const result = await manualReplayQueue();
// { succeeded: string[], failed: string[], errors: Array<{id, error}> }
```

## 🔧 Configuration

### Queue Options

```typescript
interface QueueOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  priority?: number;        // 1-10, higher = more important
  maxRetries?: number;      // Default: 3
  idempotencyKey?: string;  // For duplicate protection
  metadata?: Record<string, any>; // App-specific data
}
```

### Recommended Settings

```typescript
// Critical actions (tips, purchases)
{
  priority: 10,
  maxRetries: 5,
  idempotencyKey: `tip-${artistId}-${Date.now()}`
}

// Standard actions (playlists, comments)
{
  priority: 5,
  maxRetries: 3,
  idempotencyKey: `playlist-${name}-${Date.now()}`
}

// Analytics (play counts, views)
{
  priority: 1,
  maxRetries: 2,
  idempotencyKey: `play-${trackId}-${userId}-${Date.now()}`
}
```

## 🐛 Troubleshooting

### Actions not syncing?

```javascript
// Check service worker registration
navigator.serviceWorker.getRegistration().then(console.log);

// Check background sync support
import { isBackgroundSyncSupported } from '@/utils/serviceWorker';
console.log('Sync supported:', isBackgroundSyncSupported());

// Manually trigger sync
import { manualReplayQueue } from '@/utils/serviceWorker';
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

## 📈 Performance

- **IndexedDB Operations**: All async, non-blocking
- **Queue Size**: No hard limits (browser-dependent, typically 50MB+)
- **Replay Speed**: ~50ms per action (network-dependent)
- **Memory Usage**: Minimal (IndexedDB is disk-based)

## 🔒 Security

- Queue data stored in IndexedDB (origin-scoped)
- Auth tokens read from localStorage at replay time
- Idempotency keys prevent replay attacks
- Server must validate idempotency keys

## 🚀 Future Enhancements

- [ ] Batch replay for similar actions
- [ ] Exponential backoff for retries
- [ ] Conflict resolution for concurrent edits
- [ ] Compression for large payloads
- [ ] Encryption for sensitive data
- [ ] Periodic background sync
- [ ] Queue size limits with LRU eviction
- [ ] Analytics dashboard

## 📝 License

Part of the TipTune project.

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## 📞 Support

For issues or questions:
1. Check the [Implementation Guide](./OFFLINE_QUEUE_GUIDE.md)
2. Review [Troubleshooting](#-troubleshooting) section
3. Check [Validation Checklist](./OFFLINE_QUEUE_VALIDATION.md)
4. Open an issue on GitHub

---

**Built with ❤️ for offline-first user experiences**
