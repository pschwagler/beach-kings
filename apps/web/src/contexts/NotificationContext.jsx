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
  const maxReconnectDelay = 30000; // 30 seconds max delay

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
   * Connect to WebSocket for real-time notifications
   */
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated || !user) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return; // Already connected
    
    // Get token from localStorage
    const token = window.localStorage.getItem('beach_access_token');
    if (!token) {
      console.warn('No access token available for WebSocket connection');
      return;
    }
    
    // Build WebSocket URL
    // WebSockets don't go through Next.js rewrites, so we need to connect directly to the backend
    // If NEXT_PUBLIC_API_URL is set, use it; otherwise default to localhost:8000 (backend port)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let host;
    if (process.env.NEXT_PUBLIC_API_URL) {
      host = process.env.NEXT_PUBLIC_API_URL.replace(/^https?:\/\//, '');
    } else {
      // Default to backend port in development (matches Next.js rewrite destination)
      host = 'localhost:8000';
    }
    const wsUrl = `${protocol}//${host}/api/ws/notifications?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setWsConnected(true);
        
        // Reset reconnect attempts on successful connection
        reconnectAttemptsRef.current = 0;
        
        // Clear any reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        
        // Start ping interval (send ping every 30 seconds)
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30000);
      };
      
      ws.onmessage = (event) => {
        try {
          // Handle plain string messages (ping/pong)
          if (typeof event.data === 'string') {
            if (event.data === 'ping') {
              // Server sent ping, respond with pong
              if (ws.readyState === WebSocket.OPEN) {
                ws.send('pong');
              }
              return;
            }
            if (event.data === 'pong') {
              // Server responded to our ping
              return;
            }
          }
          
          // Try to parse as JSON for notification messages
          const data = JSON.parse(event.data);
          
          // Handle notification message
          if (data && data.type === 'notification' && data.notification) {
            const notification = data.notification;
            
            // Add notification to beginning of list
            setNotifications(prev => [notification, ...prev]);
            
            // Increment unread count if not read
            if (!notification.is_read) {
              setUnreadCount(prev => prev + 1);
            }
          }
        } catch (error) {
          // If JSON parsing fails, it might be a plain string message we already handled
          // Only log if it's not a ping/pong message
          if (event.data !== 'ping' && event.data !== 'pong') {
            console.error('Error parsing WebSocket message:', error, 'Data:', event.data);
          }
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.error('WebSocket URL was:', wsUrl);
        setWsConnected(false);
      };
      
      ws.onclose = () => {
        setWsConnected(false);
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Attempt to reconnect with exponential backoff (unless user logged out)
        if (isAuthenticated && user) {
          // Calculate delay: 3s, 6s, 12s, 24s, 30s (max)
          const baseDelay = 3000; // 3 seconds
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
  }, [isAuthenticated, user]);

  /**
   * Disconnect WebSocket
   */
  const disconnectWebSocket = useCallback(() => {
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
      // Initial fetch of notifications and count
      fetchNotifications();
      fetchUnreadCount();
      
      // Connect WebSocket
      connectWebSocket();
    } else {
      // Disconnect when logged out
      disconnectWebSocket();
      setNotifications([]);
      setUnreadCount(0);
    }
    
    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, [isAuthenticated, user, connectWebSocket, disconnectWebSocket, fetchNotifications, fetchUnreadCount]);

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

