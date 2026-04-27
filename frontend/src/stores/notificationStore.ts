import io, { Socket } from 'socket.io-client';

export interface Notification {
  id: string;
  type: 'TIP_RECEIVED' | 'FOLLOW' | 'COMMENT' | 'SYSTEM' | string;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  createdAt: string;
}

export type NotificationTransport = 'websocket' | 'polling' | 'mock';

export interface NotificationTransportAdapter {
  connect(): void;
  disconnect(): void;
  onNotification(callback: (notification: Notification) => void): void;
  onReconnect?(callback: () => void): void;
  onDisconnect?(callback: () => void): void;
}

/**
 * WebSocket transport adapter for real-time notifications
 */
class WebSocketTransportAdapter implements NotificationTransportAdapter {
  private socket: Socket | null = null;
  private socketUrl: string;
  private token: string;

  constructor(socketUrl: string, token: string) {
    this.socketUrl = socketUrl;
    this.token = token;
  }

  connect(): void {
    this.socket = io(this.socketUrl, {
      auth: { token: this.token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('Connected to notification server');
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  onNotification(callback: (notification: Notification) => void): void {
    if (!this.socket) return;

    // Listen for different notification types
    this.socket.on('tipReceived', (notification: Notification) => {
      callback(notification);
    });

    this.socket.on('newFollow', (notification: Notification) => {
      callback(notification);
    });

    this.socket.on('newComment', (notification: Notification) => {
      callback(notification);
    });

    this.socket.on('systemNotification', (notification: Notification) => {
      callback(notification);
    });
  }

  onReconnect(callback: () => void): void {
    if (!this.socket) return;
    this.socket.on('reconnect', callback);
  }

  onDisconnect(callback: () => void): void {
    if (!this.socket) return;
    this.socket.on('disconnect', callback);
  }
}

/**
 * Mock transport adapter for testing and offline mode
 */
class MockTransportAdapter implements NotificationTransportAdapter {
  private notificationCallback: ((notification: Notification) => void) | null = null;

  connect(): void {
    console.log('Mock notification transport connected');
  }

  disconnect(): void {
    console.log('Mock notification transport disconnected');
  }

  onNotification(callback: (notification: Notification) => void): void {
    this.notificationCallback = callback;
  }

  // Test helper to simulate incoming notifications
  simulateNotification(notification: Notification): void {
    if (this.notificationCallback) {
      this.notificationCallback(notification);
    }
  }

  onReconnect(_callback: () => void): void {
    // No-op for mock
  }

  onDisconnect(_callback: () => void): void {
    // No-op for mock
  }
}

/**
 * Client-side notification store with transport adapters.
 * Manages unread/read state machine independently from transport.
 */
class NotificationStore {
  private notifications: Notification[] = [];
  private unreadCount: number = 0;
  private listeners: Set<() => void>;
  private transport: NotificationTransportAdapter | null = null;
  private queuedNotifications: Notification[] = [];
  private isOnline: boolean = navigator.onLine;

  constructor() {
    this.listeners = new Set();
    this.loadFromStorage();

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushQueuedNotifications();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // ==================== State Access ====================

  getNotifications(): Notification[] {
    return [...this.notifications];
  }

  getUnreadCount(): number {
    return this.unreadCount;
  }

  getUnreadNotifications(): Notification[] {
    return this.notifications.filter((n) => !n.isRead);
  }

  // ==================== State Mutations ====================

  addNotification(notification: Notification): void {
    // Deduplication check
    const exists = this.notifications.some((n) => n.id === notification.id);
    if (exists) return;

    this.notifications = [notification, ...this.notifications];

    if (!notification.isRead) {
      this.unreadCount++;
    }

    this.saveToStorage();
    this.notifyListeners();
  }

  markAsRead(id: string): void {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification || notification.isRead) return;

    notification.isRead = true;
    this.unreadCount = Math.max(0, this.unreadCount - 1);

    this.saveToStorage();
    this.notifyListeners();
  }

  markAllAsRead(): void {
    let markedCount = 0;

    this.notifications = this.notifications.map((n) => {
      if (!n.isRead) {
        markedCount++;
        return { ...n, isRead: true };
      }
      return n;
    });

    this.unreadCount = 0;
    this.saveToStorage();
    this.notifyListeners();
  }

  clearNotifications(): void {
    this.notifications = [];
    this.unreadCount = 0;
    this.saveToStorage();
    this.notifyListeners();
  }

  // ==================== Transport Management ====================

  initializeTransport(
    transportType: NotificationTransport,
    options?: { token?: string; apiUrl?: string }
  ): void {
    // Clean up existing transport
    this.disconnect();

    const token = options?.token || localStorage.getItem('authToken') || '';
    const apiUrl =
      options?.apiUrl ||
      import.meta.env.VITE_API_BASE_URL ||
      'http://localhost:3001';

    switch (transportType) {
      case 'websocket':
        const socketUrl = `${apiUrl.replace('/api', '')}/notifications`;
        if (token) {
          this.transport = new WebSocketTransportAdapter(socketUrl, token);
          this.setupTransportListeners();
          this.transport.connect();
        }
        break;

      case 'mock':
        this.transport = new MockTransportAdapter();
        this.setupTransportListeners();
        this.transport.connect();
        break;

      default:
        console.warn(`Unsupported transport type: ${transportType}`);
    }
  }

  disconnect(): void {
    if (this.transport) {
      this.transport.disconnect();
      this.transport = null;
    }
  }

  // ==================== Queue Management ====================

  queueNotification(notification: Notification): void {
    this.queuedNotifications.push(notification);
  }

  private flushQueuedNotifications(): void {
    while (this.queuedNotifications.length > 0) {
      const notification = this.queuedNotifications.shift()!;
      this.addNotification(notification);
    }
  }

  // ==================== API Integration ====================

  async fetchFromApi(apiClient: any): Promise<void> {
    try {
      const response = await apiClient.get('/notifications');
      this.notifications = response.data.data || [];

      const countResponse = await apiClient.get('/notifications/unread-count');
      this.unreadCount = countResponse.data.count || 0;

      this.saveToStorage();
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to fetch notifications from API:', error);
    }
  }

  async markAsReadApi(id: string, apiClient: any): Promise<boolean> {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      this.markAsRead(id);
      return true;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
  }

  async markAllAsReadApi(apiClient: any): Promise<boolean> {
    try {
      await apiClient.patch('/notifications/read-all');
      this.markAllAsRead();
      return true;
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      return false;
    }
  }

  // ==================== Reactivity ====================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  // ==================== Transport Listeners ====================

  private setupTransportListeners(): void {
    if (!this.transport) return;

    this.transport.onNotification((notification) => {
      if (this.isOnline) {
        this.addNotification(notification);
      } else {
        this.queueNotification(notification);
      }
    });

    this.transport.onReconnect?.(() => {
      console.log('Notification transport reconnected');
      this.flushQueuedNotifications();
    });

    this.transport.onDisconnect?.(() => {
      console.log('Notification transport disconnected');
    });
  }

  // ==================== Persistence ====================

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('tiptune.notifications.v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.notifications = parsed.notifications || [];
        this.unreadCount = parsed.unreadCount || 0;
      }
    } catch (error) {
      console.error('Failed to load notifications from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        notifications: this.notifications,
        unreadCount: this.unreadCount,
      };
      localStorage.setItem('tiptune.notifications.v1', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save notifications to storage:', error);
    }
  }
}

// ==================== Singleton Export ====================

export const notificationStore = new NotificationStore();
