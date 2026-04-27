/* Utilities for registering service worker and subscribing to Push.
   Adapted for Vite frontend environment (use VITE_PUBLIC_VAPID_KEY env var).
   Includes offline queue management and background sync integration.
*/
/* eslint-disable no-console */

import { offlineQueue, queueRequest, triggerSync, replayQueue, type QueueStats } from './offlineQueue';

const VAPID_PUBLIC_KEY = (import.meta as any).env?.VITE_PUBLIC_VAPID_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration.scope);
    
    // Set up message listener for sync events
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    
    return registration;
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
    return null;
  }
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  const permission = await Notification.requestPermission();
  return permission; // 'granted' | 'denied' | 'default'
}

export async function subscribeToPush(registration?: ServiceWorkerRegistration) {
  if (!registration) registration = await navigator.serviceWorker.ready;
  if (!('PushManager' in window) || !registration) return null;
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    // Send subscription to server so it can send push messages
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(subscription)
      });
    } catch (e) {
      console.warn('Failed to send subscription to server', e);
    }
    return subscription;
  } catch (err) {
    console.warn('Push subscription failed', err);
    return null;
  }
}

export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) {
    await r.unregister();
  }
}

/**
 * Handle messages from service worker
 */
function handleServiceWorkerMessage(event: MessageEvent) {
  const { type, actionId, url, method, error, permanent, retryCount } = event.data || {};
  
  switch (type) {
    case 'SYNC_SUCCESS':
      console.log(`Action ${actionId} synced successfully: ${method} ${url}`);
      // Dispatch custom event for UI to listen to
      window.dispatchEvent(new CustomEvent('offline-sync-success', {
        detail: { actionId, url, method }
      }));
      break;
      
    case 'SYNC_FAILED':
      console.error(`Action ${actionId} sync failed: ${error}`);
      window.dispatchEvent(new CustomEvent('offline-sync-failed', {
        detail: { actionId, url, method, error, permanent, retryCount }
      }));
      break;
  }
}

/**
 * Queue a request for offline replay
 */
export async function queueOfflineRequest(
  url: string,
  options: RequestInit & {
    priority?: number;
    maxRetries?: number;
    idempotencyKey?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<string> {
  const actionId = await queueRequest(url, options);
  
  // Attempt to trigger background sync
  await triggerSync('offline-replay');
  
  return actionId;
}

/**
 * Manually trigger queue replay
 */
export async function manualReplayQueue(): Promise<{
  succeeded: string[];
  failed: string[];
  errors: Array<{ id: string; error: string }>;
}> {
  return replayQueue();
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  return offlineQueue.getStats();
}

/**
 * Get all queued actions
 */
export async function getQueuedActions() {
  return offlineQueue.getAll();
}

/**
 * Clear a specific action from the queue
 */
export async function clearQueuedAction(actionId: string): Promise<void> {
  return offlineQueue.remove(actionId);
}

/**
 * Clear all queued actions
 */
export async function clearAllQueuedActions(): Promise<void> {
  return offlineQueue.clearQueue();
}

/**
 * Get replay history for an action
 */
export async function getReplayHistory(actionId: string) {
  return offlineQueue.getReplayHistory(actionId);
}

/**
 * Check if background sync is supported
 */
export function isBackgroundSyncSupported(): boolean {
  return 'serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype;
}

/**
 * Check if we're currently online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Set up online/offline event listeners
 */
export function setupOnlineOfflineListeners(
  onOnline?: () => void,
  onOffline?: () => void
): () => void {
  const handleOnline = () => {
    console.log('Network connection restored');
    if (onOnline) onOnline();
    // Automatically trigger sync when coming back online
    triggerSync('offline-replay').catch(console.error);
  };
  
  const handleOffline = () => {
    console.log('Network connection lost');
    if (onOffline) onOffline();
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

export default {
  registerServiceWorker,
  unregisterServiceWorker,
  requestNotificationPermission,
  subscribeToPush,
  queueOfflineRequest,
  manualReplayQueue,
  getQueueStats,
  getQueuedActions,
  clearQueuedAction,
  clearAllQueuedActions,
  getReplayHistory,
  isBackgroundSyncSupported,
  isOnline,
  setupOnlineOfflineListeners,
};
