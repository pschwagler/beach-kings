'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { 
  getNotifications, 
  getUnreadCount, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const userRef = useRef(user);
  const maxReconnectDelay = 30000; // 30 seconds max delay

  // Keep refs in sync so onclose handler reads current values
  isAuthenticatedRef.current = isAuthenticated;
  userRef.current = user;

  /**
   * Fetch notifications with pagination
   */
  const fetchNotifications = useCallback(async (limit = 50, offset = 0, unreadOnly = false) => {
    if (!isAuthenticated) return;
    
    setIsLoading(true);
    try {
      const response = await getNotifications({ limit, offset, unreadOnly });
      setNotifications(response.notifications || []);
      return response;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return { notifications: [], total_count: 0, has_more: false };
    } finally {
      setIsLoading(false);
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
  const markAsRead = useCallback(async (notificationId) => {
    if (!isAuthenticated) return;
    
    try {
      const updatedNotification = await markNotificationAsRead(notificationId);
      
      // Update local state
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, is_read: true, read_at: updatedNotification.read_at }
            : notif
        )
      );
      
      // Update unread count
      if (unreadCount > 0) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      return updatedNotification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }, [isAuthenticated, unreadCount]);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await markAllNotificationsAsRead();
      
      // Update local state
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, is_read: true, read_at: new Date().toISOString() }))
      );
      
      // Reset unread count
      setUnreadCount(0);
      
      return response;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }, [isAuthenticated]);

  /**
   * Resolve backend host for WebSocket. In dev we fetch /api/backend-url (with fallback and one retry).
   */
  const getBackendHostForWebSocket = useCallback(async () => {
    if (process.env.NODE_ENV !== 'development') {
      if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL.replace(/^https?:\/\//, '');
      }
      return 'localhost:8000';
    }
    const fallback = 'localhost:8000';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/backend-url');
        if (res.ok) {
          const { url } = await res.json();
          if (url) return url.replace(/^https?:\/\//, '');
        }
      } catch (_) {
        if (attempt === 1) return fallback;
      }
    }
    return fallback;
  }, []);

  /**
   * Connect to WebSocket for real-time notifications
   */
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticatedRef.current || !userRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    // Also skip if a connection is currently being established
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const token = window.localStorage.getItem('beach_access_token');
    if (!token) {
      console.warn('No access token available for WebSocket connection');
      return;
    }

    intentionalCloseRef.current = false;

    (async () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = await getBackendHostForWebSocket();
      const wsUrl = `${protocol}//${host}/api/ws/notifications?token=${token}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          reconnectAttemptsRef.current = 0;

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }

          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            if (typeof event.data === 'string') {
              if (event.data === 'ping') {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send('pong');
                }
                return;
              }
              if (event.data === 'pong') return;
            }

            const data = JSON.parse(event.data);

            if (data && data.type === 'notification' && data.notification) {
              const notification = data.notification;
              setNotifications(prev => [notification, ...prev]);
              if (!notification.is_read) {
                setUnreadCount(prev => prev + 1);
              }
            }
          } catch (error) {
            if (event.data !== 'ping' && event.data !== 'pong') {
              console.error('Error parsing WebSocket message:', error, 'Data:', event.data);
            }
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setWsConnected(false);
        };

        ws.onclose = () => {
          setWsConnected(false);

          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }

          // Only reconnect on unexpected disconnects while still authenticated
          if (!intentionalCloseRef.current && isAuthenticatedRef.current && userRef.current) {
            const baseDelay = 3000;
            const delay = Math.min(
              baseDelay * Math.pow(2, reconnectAttemptsRef.current),
              maxReconnectDelay
            );
            reconnectAttemptsRef.current += 1;

            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, delay);
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        setWsConnected(false);
      }
    })();
  }, [getBackendHostForWebSocket]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Disconnect WebSocket
   */
  const disconnectWebSocket = useCallback(() => {
    intentionalCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset reconnect attempts
    reconnectAttemptsRef.current = 0;
    
    setWsConnected(false);
  }, []);

  // Connect WebSocket when authenticated, disconnect when not
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchNotifications();
      fetchUnreadCount();
      connectWebSocket();
    } else {
      disconnectWebSocket();
      setNotifications([]);
      setUnreadCount(0);
    }

    return () => {
      disconnectWebSocket();
    };
  }, [isAuthenticated, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    notifications,
    unreadCount,
    isLoading,
    wsConnected,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    connectWebSocket,
    disconnectWebSocket,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

