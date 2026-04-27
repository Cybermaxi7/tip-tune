# Offline Queue Validation Checklist

## Pre-Validation Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Open Browser DevTools
- Open Chrome/Edge DevTools (F12)
- Navigate to Application tab
- Ensure Service Worker is registered

## Acceptance Criteria Validation

### ✅ Criterion 1: Offline actions queue locally

**Test Steps:**
1. Open DevTools → Network tab
2. Set throttling to "Offline"
3. Perform an action (e.g., send tip, create playlist)
4. Open DevTools → Application → IndexedDB → TipTuneOfflineQueue → queue
5. Verify action is stored with:
   - Unique ID
   - URL and method
   - Request body
   - Priority
   - Timestamp
   - retryCount: 0

**Expected Result:** ✅ Action is stored in IndexedDB queue store

**Validation Command:**
```javascript
// Run in browser console
import { offlineQueue } from './src/utils/offlineQueue';
const actions = await offlineQueue.getAll();
console.log('Queued actions:', actions);
```

---

### ✅ Criterion 2: Replay metadata is persisted

**Test Steps:**
1. Queue an action while offline (see Criterion 1)
2. Set Network back to "Online"
3. Wait for background sync or trigger manual sync
4. Open DevTools → Application → IndexedDB → TipTuneOfflineQueue → metadata
5. Verify metadata entry with:
   - actionId (matches queued action)
   - attemptedAt timestamp
   - success: true/false
   - statusCode (if successful)
   - error message (if failed)

**Expected Result:** ✅ Replay metadata is stored in IndexedDB metadata store

**Validation Command:**
```javascript
// Run in browser console
import { offlineQueue } from './src/utils/offlineQueue';
const history = await offlineQueue.getReplayHistory('ACTION_ID');
console.log('Replay history:', history);
```

---

### ✅ Criterion 3: Sync failures surface to the UI

**Test Steps:**
1. Queue an action while offline
2. Modify the action URL to an invalid endpoint (or mock server error)
3. Set Network back to "Online"
4. Trigger sync
5. Check for:
   - Console error message
   - Custom event `offline-sync-failed` fired
   - Service worker notification shown
   - UI component displays error (if implemented)

**Expected Result:** ✅ Failures are visible through multiple channels

**Validation Command:**
```javascript
// Run in browser console - listen for events
window.addEventListener('offline-sync-failed', (event) => {
  console.log('Sync failed event:', event.detail);
});
```

---

## Browser-Based Test Suite

### Test 1: Queue Enqueue

**Objective:** Verify actions can be enqueued

```javascript
import { queueRequest } from './src/utils/offlineQueue';

// Test basic enqueue
const actionId = await queueRequest('/api/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ test: 'data' }),
  priority: 5,
  maxRetries: 3
});

console.assert(actionId, 'Action ID should be returned');
console.log('✅ Test 1 passed: Queue enqueue');
```

---

### Test 2: Queue Replay

**Objective:** Verify queued actions are replayed

```javascript
import { replayQueue, offlineQueue } from './src/utils/offlineQueue';

// Mock successful response
const originalFetch = window.fetch;
window.fetch = async (url, options) => {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true })
  };
};

// Queue and replay
const actionId = await queueRequest('/api/test', {
  method: 'POST',
  priority: 5,
  maxRetries: 3
});

const result = await replayQueue();
console.assert(result.succeeded.includes(actionId), 'Action should succeed');

const action = await offlineQueue.get(actionId);
console.assert(action === null, 'Action should be removed after success');

window.fetch = originalFetch;
console.log('✅ Test 2 passed: Queue replay');
```

---

### Test 3: Duplicate Protection

**Objective:** Verify idempotency key prevents duplicates

```javascript
import { queueRequest, offlineQueue } from './src/utils/offlineQueue';

const idempotencyKey = 'test-key-' + Date.now();

const id1 = await queueRequest('/api/test', {
  method: 'POST',
  idempotencyKey,
  priority: 5,
  maxRetries: 3
});

const id2 = await queueRequest('/api/test', {
  method: 'POST',
  idempotencyKey,
  priority: 5,
  maxRetries: 3
});

console.assert(id1 === id2, 'Same idempotency key should return same ID');

const actions = await offlineQueue.getAll();
const matching = actions.filter(a => a.idempotencyKey === idempotencyKey);
console.assert(matching.length === 1, 'Only one action should be queued');

console.log('✅ Test 3 passed: Duplicate protection');
```

---

### Test 4: Notification Click Routing

**Objective:** Verify notification clicks navigate correctly

**Manual Test Steps:**
1. Queue an action and trigger sync
2. Wait for sync notification to appear
3. Click the notification
4. Verify browser navigates to `/settings?tab=sync`

**Expected Result:** ✅ Clicking notification opens correct page

---

### Test 5: Max Retries

**Objective:** Verify actions are removed after max retries

```javascript
import { queueRequest, replayQueue, offlineQueue } from './src/utils/offlineQueue';

// Mock failing response
const originalFetch = window.fetch;
window.fetch = async () => {
  throw new Error('Network error');
};

const actionId = await queueRequest('/api/test', {
  method: 'POST',
  priority: 5,
  maxRetries: 2
});

// First attempt
await replayQueue();
let action = await offlineQueue.get(actionId);
console.assert(action.retryCount === 1, 'Retry count should be 1');

// Second attempt
await replayQueue();
action = await offlineQueue.get(actionId);
console.assert(action.retryCount === 2, 'Retry count should be 2');

// Third attempt - should remove
await replayQueue();
action = await offlineQueue.get(actionId);
console.assert(action === null, 'Action should be removed after max retries');

window.fetch = originalFetch;
console.log('✅ Test 5 passed: Max retries');
```

---

## Unit Test Execution

### Run All Tests
```bash
cd frontend
npm test -- offlineQueue.test.ts
```

### Expected Output
```
✓ offlineQueue > enqueue > should enqueue an action successfully
✓ offlineQueue > enqueue > should prevent duplicate actions with same idempotency key
✓ offlineQueue > enqueue > should assign timestamp and retryCount to new actions
✓ offlineQueue > getAll > should return empty array when queue is empty
✓ offlineQueue > getAll > should return all queued actions sorted by priority and timestamp
✓ offlineQueue > get > should retrieve a specific action by ID
✓ offlineQueue > get > should return null for non-existent action
✓ offlineQueue > remove > should remove an action from the queue
✓ offlineQueue > incrementRetry > should increment retry count for an action
✓ offlineQueue > saveReplayMetadata > should save replay metadata
✓ offlineQueue > getReplayHistory > should return replay history sorted by attemptedAt
✓ offlineQueue > getStats > should return correct queue statistics
✓ offlineQueue > clearQueue > should clear all queued actions
✓ queueRequest > should queue a request with default options
✓ queueRequest > should queue a request with custom options
✓ replayQueue > should replay successful actions and remove them from queue
✓ replayQueue > should handle failed actions and increment retry count
✓ replayQueue > should remove actions that exceed max retries
✓ replayQueue > should handle HTTP errors correctly
✓ triggerSync > should register background sync when supported

Test Files  1 passed (1)
     Tests  20 passed (20)
```

---

## Integration Testing

### Scenario 1: Complete Offline-to-Online Flow

1. **Setup:**
   - User is online
   - Service worker is registered
   - No queued actions

2. **Go Offline:**
   - Set Network to "Offline"
   - Perform 3 actions with different priorities (10, 5, 1)
   - Verify all 3 are queued in IndexedDB

3. **Come Online:**
   - Set Network back to "Online"
   - Wait for background sync (or trigger manual)
   - Verify actions replay in priority order (10 → 5 → 1)
   - Verify all actions removed from queue
   - Verify metadata saved for each

4. **Validation:**
   ```javascript
   const stats = await offlineQueue.getStats();
   console.assert(stats.totalQueued === 0, 'Queue should be empty');
   console.assert(stats.totalSucceeded === 3, 'All should succeed');
   ```

---

### Scenario 2: Partial Failure Recovery

1. **Setup:**
   - Queue 3 actions
   - Mock server to fail first 2, succeed on 3rd

2. **First Sync:**
   - Trigger replay
   - Verify 2 actions remain in queue with retryCount: 1
   - Verify 1 action removed (succeeded)

3. **Second Sync:**
   - Mock server to succeed all
   - Trigger replay
   - Verify all actions removed
   - Verify metadata shows multiple attempts for first 2

---

### Scenario 3: Idempotency Protection

1. **Setup:**
   - User clicks "Send Tip" button rapidly while offline
   - Same tip queued 5 times with same idempotency key

2. **Validation:**
   ```javascript
   const actions = await offlineQueue.getAll();
   console.assert(actions.length === 1, 'Only one action should be queued');
   ```

3. **Sync:**
   - Come online and sync
   - Verify only 1 request sent to server
   - Check server logs for single tip creation

---

## Performance Testing

### Test 1: Large Queue Performance

```javascript
// Queue 100 actions
const ids = [];
for (let i = 0; i < 100; i++) {
  const id = await queueRequest(`/api/test/${i}`, {
    method: 'POST',
    priority: Math.floor(Math.random() * 10),
    maxRetries: 3
  });
  ids.push(id);
}

// Measure retrieval time
console.time('getAll');
const actions = await offlineQueue.getAll();
console.timeEnd('getAll');
// Should be < 100ms

// Measure replay time
console.time('replay');
await replayQueue();
console.timeEnd('replay');
// Should be < 5s for 100 actions
```

---

### Test 2: Metadata Pruning

```javascript
// Create 200 metadata entries for one action
const actionId = await queueRequest('/api/test', {
  method: 'POST',
  priority: 5,
  maxRetries: 3
});

for (let i = 0; i < 200; i++) {
  await offlineQueue.saveReplayMetadata({
    actionId,
    attemptedAt: Date.now() + i,
    success: i % 2 === 0,
    error: i % 2 === 1 ? 'Test error' : undefined
  });
}

// Prune to keep only 100
await offlineQueue.pruneMetadata(100);

const history = await offlineQueue.getReplayHistory(actionId);
console.assert(history.length === 100, 'Should keep only 100 most recent');
```

---

## Browser Compatibility Testing

### Chrome/Edge (Background Sync Supported)

- [ ] Service worker registers successfully
- [ ] Background sync registers on queue
- [ ] Automatic replay on network restore
- [ ] Notifications shown for sync results
- [ ] Notification clicks navigate correctly

### Firefox/Safari (No Background Sync)

- [ ] Service worker registers successfully
- [ ] Manual replay works
- [ ] Online/offline listeners trigger replay
- [ ] UI shows manual sync button
- [ ] Manual sync button works correctly

---

## Checklist Summary

### Implementation Complete
- [x] offlineQueue.ts created with full IndexedDB implementation
- [x] sw.js updated with real background sync
- [x] serviceWorker.ts updated with integration utilities
- [x] Unit tests created (20 test cases)
- [x] Integration examples provided
- [x] Documentation written

### Acceptance Criteria Met
- [x] Offline actions queue locally in IndexedDB
- [x] Replay metadata is persisted in IndexedDB
- [x] Sync failures surface to UI via events and notifications
- [x] Browser-based tests defined for all scenarios
- [x] Notification click routing implemented

### Ready for Validation
- [ ] Run `npm install` in frontend directory
- [ ] Run `npm test -- offlineQueue.test.ts` (20 tests should pass)
- [ ] Test in browser with DevTools
- [ ] Validate all acceptance criteria
- [ ] Test on multiple browsers
- [ ] Verify performance with large queues

---

## Notes

- All code follows TypeScript best practices
- IndexedDB operations are fully async
- Service worker uses Workbox for caching
- Duplicate protection via idempotency keys
- Priority-based replay order
- Comprehensive error handling
- Event-driven architecture for UI updates
- Graceful degradation for unsupported browsers
