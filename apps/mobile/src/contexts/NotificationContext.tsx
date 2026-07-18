/**
 * Notification transport context. REST hydration and unread counts live in
 * TanStack Query; this provider only connects the WebSocket, merges transport
 * events into that cache, and maintains transient event listeners.
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@beach-kings/shared';
import { useAuth } from './AuthContext';
import useWebSocket from '@/hooks/useWebSocket';
import { useNotificationQuery } from '@/hooks/useNotificationQuery';
import { getSocketNotification, upsertNotification } from '@/lib/notificationCache';
import { notificationQueryKeys, socialQueryKeys } from '@/lib/socialQueryKeys';

export type NotificationListener = (notification: Notification) => void;

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
  readonly addNotificationListener: (
    type: string,
    callback: NotificationListener,
  ) => () => void;
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

interface NotificationProviderProps {
  readonly children: React.ReactNode;
}

function buildWsUrl(): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  return baseUrl.replace(/^http/, 'ws') + '/api/ws/notifications';
}

export default function NotificationProvider({
  children,
}: NotificationProviderProps): React.ReactNode {
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const {
    notifications,
    unreadCount,
    dmUnreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotificationQuery();
  const listenersRef = useRef<readonly ListenerEntry[]>([]);

  const addNotificationListener = useCallback(
    (type: string, callback: NotificationListener) => {
      const entry: ListenerEntry = { type, callback };
      listenersRef.current = [...listenersRef.current, entry];
      return () => {
        listenersRef.current = listenersRef.current.filter(
          (candidate) => candidate !== entry,
        );
      };
    },
    [],
  );

  const handleMessage = useCallback((data: unknown) => {
    if (userId === 0) return;
    const message = getSocketNotification(data);
    if (message == null) return;
    const { eventType, notification } = message;
    if (
      eventType !== 'notification' &&
      eventType !== 'direct_message' &&
      eventType !== 'notification_updated'
    ) return;

    const existing = queryClient
      .getQueryData<Notification[]>(notificationQueryKeys.feed(userId))
      ?.find((item) => item.id === notification.id);
    const wasUnread = existing != null && !existing.is_read;
    const isUnread = notification.dismissed_at == null && !notification.is_read;
    const unreadDelta = Number(isUnread) - Number(wasUnread);
    queryClient.setQueryData<Notification[]>(
      notificationQueryKeys.feed(userId),
      (current) => upsertNotification(current, notification),
    );
    if (unreadDelta !== 0) {
      queryClient.setQueryData<{ count: number }>(
        notificationQueryKeys.unreadCount(userId),
        (current) => ({ count: Math.max(0, (current?.count ?? 0) + unreadDelta) }),
      );
    }
    if (eventType === 'notification_updated' && existing == null) {
      // The updated row may be outside the hydrated feed page, so its former
      // unread state is unknown. Ask the authoritative count endpoint instead
      // of guessing and letting a badge drift.
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKeys.unreadCount(userId),
      });
    }

    if (eventType !== 'notification_updated') {
      for (const listener of listenersRef.current) {
        if (listener.type === notification.type) listener.callback(notification);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }

    if (notification.type === 'friend_request' || notification.type === 'friend_accepted') {
      void queryClient.invalidateQueries({ queryKey: socialQueryKeys.all(userId) });
    }
  }, [queryClient, userId]);

  // Toggled briefly false→true to force a reconnect when the app
  // returns from background (useWebSocket reconnects on `enabled` flips).
  const [transportEnabled, setTransportEnabled] = useState(false);

  useEffect(() => {
    setTransportEnabled(isAuthenticated);
  }, [isAuthenticated]);

  useWebSocket({
    url: buildWsUrl(),
    enabled: transportEnabled,
    onMessage: handleMessage,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated) {
        setTransportEnabled(false);
        setTimeout(() => setTransportEnabled(true), 0);
      }
    });
    return () => subscription.remove();
  }, [isAuthenticated]);

  const value: NotificationContextValue = useMemo(
    () => ({
      notifications,
      unreadCount,
      dmUnreadCount,
      markAsRead,
      markAllAsRead,
      addNotificationListener,
    }),
    [
      notifications,
      unreadCount,
      dmUnreadCount,
      markAsRead,
      markAllAsRead,
      addNotificationListener,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
