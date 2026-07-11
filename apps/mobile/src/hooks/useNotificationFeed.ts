/**
 * Manages the notification feed state: the list itself, derived unread
 * counts, read-state mutations, and a listener registry for callers that
 * only care about a specific notification `type`.
 *
 * Transport-agnostic — pair with any source that calls `handleMessage`
 * with a parsed WebSocket payload.
 */
import { useState, useCallback, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';

export interface Notification {
  readonly id: number;
  readonly type: string;
  readonly message: string;
  readonly is_read: boolean;
  readonly created_at: string;
}

export type NotificationListener = (notification: Notification) => void;

interface ListenerEntry {
  readonly type: string;
  readonly callback: NotificationListener;
}

export interface UseNotificationFeedResult {
  readonly notifications: readonly Notification[];
  readonly unreadCount: number;
  readonly dmUnreadCount: number;
  readonly markAsRead: (id: number) => void;
  readonly markAllAsRead: () => void;
  readonly addNotificationListener: (
    type: string,
    callback: NotificationListener,
  ) => () => void;
  readonly handleMessage: (data: unknown) => void;
  readonly reset: () => void;
}

function getNotificationPayload(value: unknown): { type: string; payload: Notification } | null {
  if (value === null || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const payload = obj.payload ?? obj.notification;
  if (typeof obj.type !== 'string' || payload === null || typeof payload !== 'object') {
    return null;
  }
  return { type: obj.type, payload: payload as Notification };
}

function useNotificationFeed(): UseNotificationFeedResult {
  const [notifications, setNotifications] = useState<readonly Notification[]>([]);
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

  const addNotificationListener = useCallback(
    (type: string, callback: NotificationListener) => {
      const entry: ListenerEntry = { type, callback };
      listenersRef.current = [...listenersRef.current, entry];
      return () => {
        listenersRef.current = listenersRef.current.filter((e) => e !== entry);
      };
    },
    [],
  );

  const dispatchToListeners = useCallback((notification: Notification) => {
    for (const entry of listenersRef.current) {
      if (entry.type === notification.type) {
        entry.callback(notification);
      }
    }
  }, []);

  const handleMessage = useCallback(
    (data: unknown) => {
      const message = getNotificationPayload(data);
      if (message == null) return;

      if (message.type === 'notification' || message.type === 'direct_message') {
        const notification = message.payload;
        setNotifications((prev) => [notification, ...prev]);
        dispatchToListeners(notification);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
      } else if (message.type === 'notification_updated') {
        const updated = message.payload;
        setNotifications((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
      }
    },
    [dispatchToListeners],
  );

  const reset = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    unreadCount,
    dmUnreadCount,
    markAsRead,
    markAllAsRead,
    addNotificationListener,
    handleMessage,
    reset,
  };
}

export default useNotificationFeed;
