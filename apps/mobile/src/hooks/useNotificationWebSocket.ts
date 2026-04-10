/**
 * WebSocket hook for real-time notifications and DMs on mobile.
 *
 * Ported from the web version (apps/web/src/hooks/useNotificationWebSocket.ts).
 * Key differences:
 *   - Reads auth token from expo-secure-store instead of window.localStorage
 *   - Resolves WS URL from EXPO_PUBLIC_API_URL env var (no /api/backend-url fetch)
 *   - Uses React Native's global WebSocket (same API as browser)
 */

import { useState, useCallback, useEffect, useRef, MutableRefObject } from 'react';
import * as SecureStore from 'expo-secure-store';

const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const PING_INTERVAL = 30000; // 30 seconds
const ACCESS_TOKEN_KEY = 'beach_access_token';

interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  is_read: boolean;
  read_at?: string | null;
  link_url?: string | null;
  created_at: string;
}

interface User {
  id: number;
  email?: string;
  phone?: string;
  name?: string;
  player_id?: number;
}

interface UseNotificationWebSocketOptions {
  isAuthenticated: boolean;
  user: User | null;
  onNotification: (notification: Notification) => void;
  onNotificationUpdated: (notification: Notification) => void;
  fetchUnreadCountRef: MutableRefObject<() => void>;
  fetchDmUnreadCountRef: MutableRefObject<() => void>;
}

/**
 * Resolve backend host for WebSocket from env var.
 */
function getWsUrl(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
  const host = apiUrl.replace(/^https?:\/\//, '');
  const protocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
  return `${protocol}//${host}/api/ws/notifications`;
}

/**
 * Manages WebSocket connection for real-time notifications and DMs.
 *
 * Handles connect/disconnect, ping/pong keepalive, exponential backoff
 * reconnect, and message routing. Mirrors the web hook's API.
 */
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
  const onNotificationRef = useRef(onNotification);
  const onNotificationUpdatedRef = useRef(onNotificationUpdated);
  useEffect(() => { onNotificationRef.current = onNotification; }, [onNotification]);
  useEffect(() => { onNotificationUpdatedRef.current = onNotificationUpdated; }, [onNotificationUpdated]);

  const connectWebSocket = useCallback(async () => {
    if (!isAuthenticatedRef.current || !userRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    let token: string | null = null;
    try {
      token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch {
      // SecureStore unavailable — cannot authenticate
      return;
    }
    if (!token) return;

    intentionalCloseRef.current = false;

    const wsUrl = getWsUrl();

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
        }, PING_INTERVAL);
      };

      ws.onmessage = (event: WebSocketMessageEvent) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : '';

          if (raw === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('pong');
            }
            return;
          }
          if (raw === 'pong') return;

          const data = JSON.parse(raw);

          if (data?.type === 'notification' && data.notification) {
            onNotificationRef.current(data.notification);
          }

          if (data?.type === 'notification_updated' && data.notification) {
            onNotificationUpdatedRef.current(data.notification);
            fetchUnreadCountRef.current();
          }

          if (data?.type === 'direct_message' && data.message) {
            if (onDirectMessageRef.current) {
              onDirectMessageRef.current(data.message);
            }
            fetchDmUnreadCountRef.current();
          }
        } catch (error) {
          const raw = typeof event.data === 'string' ? event.data : '';
          if (raw !== 'ping' && raw !== 'pong') {
            console.error('[WS] Error parsing message:', error, 'Data:', raw);
          }
        }
      };

      ws.onerror = () => {
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
            MAX_RECONNECT_DELAY,
          );
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      };
    } catch (error) {
      console.error('[WS] Error creating WebSocket connection:', error);
      setWsConnected(false);
    }
  // All mutable values are accessed via refs — connect function never needs re-creation
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
