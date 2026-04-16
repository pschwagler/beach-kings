/**
 * Notification context — provides real-time notification state via WebSocket.
 * Connects when authenticated, handles reconnect with exponential backoff,
 * ping/pong keepalive, and haptic feedback on new notifications.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from './AuthContext';

interface Notification {
  readonly id: number;
  readonly type: string;
  readonly message: string;
  readonly is_read: boolean;
  readonly created_at: string;
}

type NotificationListener = (notification: Notification) => void;

interface ListenerEntry {
  readonly type: string;
  readonly callback: NotificationListener;
}

interface NotificationContextValue {
  readonly notifications: readonly Notification[];
  readonly unreadCount: number;
  readonly dmUnreadCount: number;
  readonly markAsRead: (id: number) => void;
  readonly markAllAsRead: () => void;
  readonly addNotificationListener: (type: string, callback: NotificationListener) => () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Hook to access notification state and actions.
 * Must be used within NotificationProvider.
 */
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;
const PING_INTERVAL_MS = 30000;

interface NotificationProviderProps {
  readonly children: React.ReactNode;
}

export default function NotificationProvider({ children }: NotificationProviderProps): React.ReactNode {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<readonly Notification[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenersRef = useRef<ListenerEntry[]>([]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const dmUnreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read && n.type === 'direct_message').length,
    [notifications],
  );

  const markAsRead = useCallback((id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, []);

  const addNotificationListener = useCallback((type: string, callback: NotificationListener) => {
    const entry: ListenerEntry = { type, callback };
    listenersRef.current = [...listenersRef.current, entry];
    return () => {
      listenersRef.current = listenersRef.current.filter((e) => e !== entry);
    };
  }, []);

  const dispatchToListeners = useCallback((notification: Notification) => {
    for (const entry of listenersRef.current) {
      if (entry.type === notification.type) {
        entry.callback(notification);
      }
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearTimers]);

  const connect = useCallback(() => {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/ws/notifications';

    disconnect();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      // Start ping keepalive
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') return;

        if (data.type === 'notification' || data.type === 'direct_message') {
          const notification: Notification = data.payload;
          setNotifications((prev) => [notification, ...prev]);
          dispatchToListeners(notification);
          // Haptic feedback for new notification
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else if (data.type === 'notification_updated') {
          const updated: Notification = data.payload;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n)),
          );
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      clearTimers();
      // Exponential backoff reconnect
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptRef.current),
        RECONNECT_MAX_MS,
      );
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (isAuthenticated && AppState.currentState === 'active') {
          connect();
        }
      }, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror — reconnect handled there
    };
  }, [isAuthenticated, disconnect, clearTimers, dispatchToListeners]);

  // Connect/disconnect based on auth state
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
      setNotifications([]);
    }
    return disconnect;
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconnect when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated && !wsRef.current) {
        reconnectAttemptRef.current = 0;
        connect();
      }
    });
    return () => subscription.remove();
  }, [isAuthenticated, connect]);

  const value: NotificationContextValue = useMemo(() => ({
    notifications,
    unreadCount,
    dmUnreadCount,
    markAsRead,
    markAllAsRead,
    addNotificationListener,
  }), [notifications, unreadCount, dmUnreadCount, markAsRead, markAllAsRead, addNotificationListener]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
