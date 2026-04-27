import { useEffect, useState, useCallback } from 'react';
import { notificationStore } from '../stores/notificationStore';
import type { Notification } from '../stores/notificationStore';
import apiClient from '../utils/api';
import { useWallet } from './useWallet';

export type { Notification } from '../stores/notificationStore';

export const useNotifications = () => {
  const { publicKey } = useWallet();
  const [storeState, setStoreState] = useState({
    notifications: notificationStore.getNotifications(),
    unreadCount: notificationStore.getUnreadCount(),
  });

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = notificationStore.subscribe(() => {
      setStoreState({
        notifications: notificationStore.getNotifications(),
        unreadCount: notificationStore.getUnreadCount(),
      });
    });

    return () => unsubscribe();
  }, []);

  // Initialize WebSocket transport
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      notificationStore.initializeTransport('websocket', { token });
    }

    return () => {
      notificationStore.disconnect();
    };
  }, []);

  // Fetch initial notifications from API
  useEffect(() => {
    if (publicKey) {
      notificationStore.fetchFromApi(apiClient);
    }
  }, [publicKey]);

  const markAsRead = useCallback(async (id: string) => {
    await notificationStore.markAsReadApi(id, apiClient);
  }, []);

  const markAllAsRead = useCallback(async () => {
    await notificationStore.markAllAsReadApi(apiClient);
  }, []);

  const refetch = useCallback(() => {
    notificationStore.fetchFromApi(apiClient);
  }, []);

  return {
    notifications: storeState.notifications,
    unreadCount: storeState.unreadCount,
    markAsRead,
    markAllAsRead,
    refetch,
  };
};
