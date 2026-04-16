/**
 * WebSocket connection hook with exponential-backoff reconnect,
 * ping/pong keepalive, and clean unmount teardown.
 *
 * Set `enabled: false` to defer the connection (e.g. when the user is
 * unauthenticated). Flip it to `true` when ready; the hook connects
 * automatically.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseWebSocketOptions {
  /** Full WebSocket URL, e.g. "wss://api.example.com/ws". */
  readonly url: string;
  /** Connect only when true. Default: true. */
  readonly enabled?: boolean;
  /** Invoked for every inbound message payload. */
  readonly onMessage?: (data: unknown) => void;
  /** Initial reconnect delay in milliseconds. Default: 3 000. */
  readonly reconnectBaseMs?: number;
  /** Maximum reconnect delay (caps exponential backoff). Default: 30 000. */
  readonly reconnectMaxMs?: number;
  /** Interval between ping frames in milliseconds. Default: 30 000. */
  readonly pingIntervalMs?: number;
}

interface UseWebSocketResult {
  /** Last message payload received (raw parsed JSON or string). */
  lastMessage: unknown | null;
  /** Whether the socket is currently open. */
  isConnected: boolean;
  /** Send a value; serialised to JSON if not already a string. */
  send: (data: unknown) => void;
}

const PING_PAYLOAD = JSON.stringify({ type: 'ping' });

/**
 * Manages a WebSocket connection lifecycle including automatic reconnection
 * with exponential backoff and a periodic ping/pong keepalive.
 */
function useWebSocket(options: UseWebSocketOptions): UseWebSocketResult {
  const {
    url,
    enabled = true,
    onMessage,
    reconnectBaseMs = 3_000,
    reconnectMaxMs = 30_000,
    pingIntervalMs = 30_000,
  } = options;

  const [lastMessage, setLastMessage] = useState<unknown | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef<boolean>(true);

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current !== null) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearPingTimer();
    clearReconnectTimer();
    if (socketRef.current) {
      // Remove handlers before closing to prevent the onclose reconnect loop.
      socketRef.current.onopen = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.close();
      socketRef.current = null;
    }
  }, [clearPingTimer, clearReconnectTimer]);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;
    disconnect();

    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);

      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(PING_PAYLOAD);
        }
      }, pingIntervalMs);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        parsed = event.data;
      }
      // Ignore pong frames silently.
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        (parsed as Record<string, unknown>)['type'] === 'pong'
      ) {
        return;
      }
      setLastMessage(parsed);
      onMessage?.(parsed);
    };

    ws.onerror = () => {
      // onclose will fire immediately after; reconnect logic lives there.
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      clearPingTimer();
      setIsConnected(false);

      if (!enabled) return;

      const backoff = Math.min(
        reconnectBaseMs * 2 ** reconnectAttemptsRef.current,
        reconnectMaxMs,
      );
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, backoff);
    };
  }, [
    url,
    enabled,
    onMessage,
    pingIntervalMs,
    reconnectBaseMs,
    reconnectMaxMs,
    disconnect,
    clearPingTimer,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  const send = useCallback((data: unknown) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    socket.send(payload);
  }, []);

  return { lastMessage, isConnected, send };
}

export default useWebSocket;
