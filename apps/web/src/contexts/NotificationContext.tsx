'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import {
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadMessageCount,
} from '../services/api';
import { useAuth } from './AuthContext';
import { useNotificationWebSocket } from '../hooks/useNotificationWebSocket';

export interface NotificationAction {
  label?: string;
  url?: string;
  style?: string;
  [key: string]: unknown;
}

export interface Notification {
  id: number;
  is_read: boolean;
  read_at?: string | null;
  title?: string | null;
  message?: string | null;
  link_url?: string | null;
  type?: string | null;
  created_at?: string | null;
  data?: {
    actions?: NotificationAction[];
    friend_request_id?: number;
    [key: string]: unknown;
  } | null;
}

/** Paginated notifications response from GET /api/notifications */
interface NotificationsPage {
  items: Notification[];
  total_count: number;
  has_more: boolean;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  dmUnreadCount: number;
  isLoading: boolean;
  wsConnected: boolean;
  fetchNotifications: (limit?: number, offset?: number, unreadOnly?: boolean) => Promise<NotificationsPage | undefined>;
  fetchUnreadCount: () => Promise<number | undefined>;
  fetchDmUnreadCount: () => Promise<number | undefined>;
  markAsRead: (notificationId: number) => Promise<Notification | undefined>;
  markAllAsRead: () => Promise<unknown>;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  onDirectMessageRef: MutableRefObject<((msg: Record<string, unknown>) => void) | null>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [dmUnreadCount, setDmUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  /**
   * Fetch notifications with pagination
   */
  const fetchNotifications = useCallback(async (limit = 50, offset = 0, unreadOnly = false): Promise<NotificationsPage | undefined> => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await getNotifications({ limit, offset, unreadOnly });
      setNotifications(response.items || []);
      return response;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return { items: [], total_count: 0, has_more: false };
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  /**
   * Fetch unread DM count
   */
  const fetchDmUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await getUnreadMessageCount();
      setDmUnreadCount(response.count || 0);
      return response.count || 0;
    } catch (error) {
      console.error('Error fetching DM unread count:', error);
      return 0;
    }
  }, [isAuthenticated]);

  /**
   * Fetch unread notification count
   */
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await getUnreadCount();
      setUnreadCount(response.count || 0);
      return response.count || 0;
    } catch (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }
  }, [isAuthenticated]);

  /**
   * Mark a single notification as read
   */
  const markAsRead = useCallback(async (notificationId: number) => {
    if (!isAuthenticated) return;

    try {
      const updatedNotification = await markNotificationAsRead(notificationId);

      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId
            ? { ...notif, is_read: true, read_at: updatedNotification.read_at }
            : notif
        )
      );

      setUnreadCount(prev => Math.max(0, prev - 1));

      return updatedNotification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }, [isAuthenticated]);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await markAllNotificationsAsRead();

      setNotifications(prev =>
        prev.map(notif => ({ ...notif, is_read: true, read_at: new Date().toISOString() }))
      );

      setUnreadCount(0);

      return response;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }, [isAuthenticated]);

  // Stable refs for callbacks passed to the WebSocket hook (avoids recreating WS on every render)
  const fetchUnreadCountRef = useRef<() => Promise<number | undefined>>(fetchUnreadCount);
  const fetchDmUnreadCountRef = useRef<() => Promise<number | undefined>>(fetchDmUnreadCount);
  fetchUnreadCountRef.current = fetchUnreadCount;
  fetchDmUnreadCountRef.current = fetchDmUnreadCount;

  /**
   * Handle new notification from WebSocket
   */
  const handleNotification = useCallback((notification: Notification) => {
    setNotifications(prev => [notification, ...prev]);
    if (!notification.is_read) {
      setUnreadCount(prev => prev + 1);
    }
  }, []);

  /**
   * Handle updated notification from WebSocket (e.g. DM summary upsert)
   */
  const handleNotificationUpdated = useCallback((updated: Notification) => {
    setNotifications(prev => {
      const idx = prev.findIndex(n => n.id === updated.id);
      if (idx !== -1) {
        const next = prev.filter(n => n.id !== updated.id);
        if (!updated.is_read) {
          return [updated, ...next];
        }
        return [...next, updated];
      }
      if (!updated.is_read) {
        return [updated, ...prev];
      }
      return prev;
    });
  }, []);

  const { wsConnected, connectWebSocket, disconnectWebSocket, onDirectMessageRef } =
    useNotificationWebSocket({
      isAuthenticated,
      user,
      onNotification: handleNotification,
      onNotificationUpdated: handleNotificationUpdated,
      fetchUnreadCountRef,
      fetchDmUnreadCountRef,
    });

  // Connect WebSocket when authenticated, disconnect when not
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchNotifications();
      fetchUnreadCount();
      fetchDmUnreadCount();
      connectWebSocket();
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setDmUnreadCount(0);
    }

    return () => {
      disconnectWebSocket();
    };
  // All fetch/connect functions are stable useCallback refs — only re-run on auth state change
  }, [isAuthenticated, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    dmUnreadCount,
    isLoading,
    wsConnected,
    fetchNotifications,
    fetchUnreadCount,
    fetchDmUnreadCount,
    markAsRead,
    markAllAsRead,
    connectWebSocket,
    disconnectWebSocket,
    onDirectMessageRef,
  }), [
    notifications,
    unreadCount,
    dmUnreadCount,
    isLoading,
    wsConnected,
    fetchNotifications,
    fetchUnreadCount,
    fetchDmUnreadCount,
    markAsRead,
    markAllAsRead,
    connectWebSocket,
    disconnectWebSocket,
    onDirectMessageRef,
  ]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
