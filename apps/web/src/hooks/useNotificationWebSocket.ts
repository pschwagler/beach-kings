'use client';

import { useState, useCallback, useEffect, useRef, MutableRefObject } from 'react';

const MAX_RECONNECT_DELAY = 30000; // 30 seconds

/**
 * Resolve backend host for WebSocket.
 * In dev we fetch /api/backend-url (with fallback and one retry).
 */
async function getBackendHostForWebSocket() {
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
}

/**
 * Manages WebSocket connection for real-time notifications and DMs.
 *
 * Extracted from NotificationContext to keep the context focused on REST state.
 * Handles connect/disconnect, ping/pong keepalive, exponential backoff reconnect,
 * and message routing.
 *
 * @param {Object} options
 * @param {boolean} options.isAuthenticated
 * @param {Object|null} options.user
 * @param {Function} options.onNotification - (notification) => void — new notification arrived
 * @param {Function} options.onNotificationUpdated - (notification) => void — existing notification updated
 * @param {React.MutableRefObject<Function>} options.fetchUnreadCountRef - ref to fetchUnreadCount
 * @param {React.MutableRefObject<Function>} options.fetchDmUnreadCountRef - ref to fetchDmUnreadCount
 * @returns {{ wsConnected, connectWebSocket, disconnectWebSocket, onDirectMessageRef }}
 */
import type { User, Notification } from '../types';

interface UseNotificationWebSocketOptions {
  isAuthenticated: boolean;
  user: User | null;
  onNotification: (notification: Notification) => void;
  onNotificationUpdated: (notification: Notification) => void;
  fetchUnreadCountRef: MutableRefObject<() => void>;
  fetchDmUnreadCountRef: MutableRefObject<() => void>;
}

export function useNotificationWebSocket({
  isAuthenticated,
  user,
  onNotification,
  onNotificationUpdated,
  fetchUnreadCountRef,
  fetchDmUnreadCountRef,
}: UseNotificationWebSocketOptions) {
  const [wsConnected, setWsConnected] = useState(false);

  const onDirectMessageRef = useRef<((msg: Record<string, unknown>) => void) | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const userRef = useRef(user);

  // Keep refs in sync so onclose handler reads current values
  isAuthenticatedRef.current = isAuthenticated;
  userRef.current = user;

  // Keep callback refs stable to avoid recreating connectWebSocket
  const onNotificationRef = useRef<(notification: Notification) => void>(onNotification);
  const onNotificationUpdatedRef = useRef<(notification: Notification) => void>(onNotificationUpdated);
  useEffect(() => { onNotificationRef.current = onNotification; }, [onNotification]);
  useEffect(() => { onNotificationUpdatedRef.current = onNotificationUpdated; }, [onNotificationUpdated]);

  /**
   * Connect to WebSocket for real-time notifications.
   */
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticatedRef.current || !userRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
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
      const wsUrl = `${protocol}//${host}/api/ws/notifications`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Authenticate via first message (keeps token out of URL logs)
          ws.send(JSON.stringify({ type: 'auth', token }));
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
              onNotificationRef.current(data.notification);
            }

            if (data && data.type === 'notification_updated' && data.notification) {
              onNotificationUpdatedRef.current(data.notification);
              fetchUnreadCountRef.current();
            }

            if (data && data.type === 'direct_message' && data.message) {
              if (onDirectMessageRef.current) {
                onDirectMessageRef.current(data.message);
              }
              fetchDmUnreadCountRef.current();
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

          if (!intentionalCloseRef.current && isAuthenticatedRef.current && userRef.current) {
            const baseDelay = 3000;
            const delay = Math.min(
              baseDelay * Math.pow(2, reconnectAttemptsRef.current),
              MAX_RECONNECT_DELAY
            );
            reconnectAttemptsRef.current += 1;

            reconnectTimeoutRef.current = setTimeout(() => {
              // eslint-disable-next-line react-hooks/immutability -- connectWebSocket is stable via useCallback; accessed via closure before declaration is valid here
              connectWebSocket();
            }, delay);
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        setWsConnected(false);
      }
    })();
  // All mutable values (token, url, callbacks) are accessed via refs — connect function never needs re-creation
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Disconnect WebSocket intentionally (no reconnect).
   */
  const disconnectWebSocket = useCallback(() => {
    intentionalCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    reconnectAttemptsRef.current = 0;
    setWsConnected(false);
  }, []);

  return { wsConnected, connectWebSocket, disconnectWebSocket, onDirectMessageRef };
}
