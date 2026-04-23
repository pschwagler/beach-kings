/**
 * Notification context — composes `useWebSocket` (transport) and
 * `useNotificationFeed` (state) so the provider stays thin and the
 * underlying concerns are independently testable.
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import useWebSocket from '@/hooks/useWebSocket';
import useNotificationFeed, {
  type Notification,
  type NotificationListener,
} from '@/hooks/useNotificationFeed';

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
  const { isAuthenticated } = useAuth();
  const {
    notifications,
    unreadCount,
    dmUnreadCount,
    markAsRead,
    markAllAsRead,
    addNotificationListener,
    handleMessage,
    reset: resetFeed,
  } = useNotificationFeed();

  // Toggled briefly false→true to force a reconnect when the app
  // returns from background (useWebSocket reconnects on `enabled` flips).
  const [transportEnabled, setTransportEnabled] = useState(false);

  useEffect(() => {
    setTransportEnabled(isAuthenticated);
    if (!isAuthenticated) {
      resetFeed();
    }
  }, [isAuthenticated, resetFeed]);

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
