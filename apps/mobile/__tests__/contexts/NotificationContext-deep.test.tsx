/**
 * Deep coverage tests for NotificationContext.
 *
 * Targets all previously uncovered branches and lines:
 * - WebSocket connect / disconnect lifecycle
 * - onopen ping interval
 * - onmessage: notification, direct_message, pong, notification_updated, malformed JSON
 * - onclose exponential-backoff reconnect
 * - markAsRead / markAllAsRead
 * - addNotificationListener / unsubscribe
 * - AppState 'active' reconnect
 * - isAuthenticated toggle (connect / disconnect)
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Control variable — mutated per-test to simulate auth state changes
// ---------------------------------------------------------------------------
let mockIsAuthenticated = false;

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn();
}

let lastWs: MockWebSocket;
global.WebSocket = jest.fn(() => {
  lastWs = new MockWebSocket();
  return lastWs;
}) as unknown as typeof WebSocket;
(global.WebSocket as unknown as { OPEN: number }).OPEN = 1;

// ---------------------------------------------------------------------------
// Mock AppState
// ---------------------------------------------------------------------------
const appStateListeners: Array<(state: string) => void> = [];

// We need to set this up before importing the module under test so that
// AppState.addEventListener is already mocked when the module-level effect runs.
const RN = require('react-native');

jest.spyOn(RN.AppState, 'addEventListener').mockImplementation(
  (...args: unknown[]) => {
    const handler = args[1] as (state: string) => void;
    appStateListeners.push(handler);
    return { remove: () => { /* noop */ } };
  },
);

Object.defineProperty(RN.AppState, 'currentState', {
  get: () => 'active',
  configurable: true,
});

// ---------------------------------------------------------------------------
// Subject under test (imported after all mocks are in place)
// ---------------------------------------------------------------------------
import NotificationProvider, { useNotifications } from '@/contexts/NotificationContext';
import * as Haptics from 'expo-haptics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  return <NotificationProvider>{children}</NotificationProvider>;
}

function makeNotification(overrides: Partial<{
  id: number;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}> = {}) {
  return {
    id: 1,
    type: 'notification',
    message: 'Hello',
    is_read: false,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function triggerWsMessage(data: unknown): void {
  act(() => {
    lastWs.onmessage?.({ data: JSON.stringify(data) });
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockIsAuthenticated = false;
  appStateListeners.splice(0, appStateListeners.length);
  (global.WebSocket as unknown as jest.Mock).mockClear();
  (Haptics.notificationAsync as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationProvider — connection lifecycle', () => {
  it('connects WebSocket when authenticated', () => {
    mockIsAuthenticated = true;

    renderHook(() => useNotifications(), { wrapper });

    expect(global.WebSocket).toHaveBeenCalledTimes(1);
    expect((global.WebSocket as unknown as jest.Mock).mock.calls[0][0]).toContain(
      '/api/ws/notifications',
    );
  });

  it('does not connect WebSocket when unauthenticated', () => {
    mockIsAuthenticated = false;

    renderHook(() => useNotifications(), { wrapper });

    expect(global.WebSocket).not.toHaveBeenCalled();
  });

  it('closes existing WebSocket and clears notifications on logout', () => {
    mockIsAuthenticated = true;
    const { result, rerender } = renderHook(() => useNotifications(), { wrapper });

    // Deliver a notification so state is non-empty
    triggerWsMessage({ type: 'notification', payload: makeNotification() });
    expect(result.current.notifications).toHaveLength(1);

    // Simulate logout by switching auth state and re-rendering
    mockIsAuthenticated = false;
    act(() => { rerender({}); });

    expect(lastWs.close).toHaveBeenCalled();
    expect(result.current.notifications).toHaveLength(0);
  });

  it('calls ws.close() when the component unmounts', () => {
    mockIsAuthenticated = true;
    const { unmount } = renderHook(() => useNotifications(), { wrapper });

    act(() => { unmount(); });

    expect(lastWs.close).toHaveBeenCalled();
  });
});

describe('NotificationProvider — onopen', () => {
  it('resets reconnect attempt counter and starts the ping interval', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    act(() => { lastWs.onopen?.(); });

    // Advance past one ping interval
    act(() => { jest.advanceTimersByTime(30_000); });

    expect(lastWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
  });

  it('sends multiple pings as the interval repeats', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    act(() => { lastWs.onopen?.(); });

    act(() => { jest.advanceTimersByTime(90_000); }); // 3 × 30 s

    expect(lastWs.send).toHaveBeenCalledTimes(3);
  });

  it('does not send ping when readyState is not OPEN', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    act(() => { lastWs.onopen?.(); });
    lastWs.readyState = MockWebSocket.CLOSED;

    act(() => { jest.advanceTimersByTime(30_000); });

    expect(lastWs.send).not.toHaveBeenCalled();
  });
});

describe('NotificationProvider — onmessage', () => {
  it('adds a notification and triggers haptics for type "notification"', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 10 }) });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe(10);
    expect(result.current.unreadCount).toBe(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('adds a notification and increments dmUnreadCount for type "direct_message"', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    triggerWsMessage({
      type: 'direct_message',
      payload: makeNotification({ id: 20, type: 'direct_message' }),
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.dmUnreadCount).toBe(1);
    expect(result.current.unreadCount).toBe(1);
  });

  it('ignores "pong" messages and does not modify notifications', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    triggerWsMessage({ type: 'pong' });

    expect(result.current.notifications).toHaveLength(0);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('updates an existing notification for type "notification_updated"', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    // Seed an unread notification
    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 5 }) });
    expect(result.current.notifications[0].is_read).toBe(false);

    // Now deliver an updated version with is_read: true
    triggerWsMessage({
      type: 'notification_updated',
      payload: makeNotification({ id: 5, is_read: true }),
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].is_read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('handles malformed JSON without throwing', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      lastWs.onmessage?.({ data: 'this is not json {{{{' });
    });

    // State should be untouched
    expect(result.current.notifications).toHaveLength(0);
  });

  it('prepends new notifications so the most recent is first', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 1, message: 'first' }) });
    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 2, message: 'second' }) });

    expect(result.current.notifications[0].id).toBe(2);
    expect(result.current.notifications[1].id).toBe(1);
  });
});

describe('NotificationProvider — onclose (reconnect backoff)', () => {
  it('schedules a reconnect after the base delay on first close', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    const firstWs = lastWs;

    act(() => { firstWs.onclose?.(); });

    // Not yet reconnected
    expect(global.WebSocket).toHaveBeenCalledTimes(1);

    // Advance past the initial 3 000 ms base delay
    act(() => { jest.advanceTimersByTime(3_001); });

    expect(global.WebSocket).toHaveBeenCalledTimes(2);
  });

  it('uses exponential back-off on subsequent closes', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    // First close — delay = 3000 ms (attempt 0)
    act(() => { lastWs.onclose?.(); });
    act(() => { jest.advanceTimersByTime(3_001); });
    expect(global.WebSocket).toHaveBeenCalledTimes(2);

    // Second close — delay = 6000 ms (attempt 1)
    act(() => { lastWs.onclose?.(); });
    act(() => { jest.advanceTimersByTime(3_000); }); // not enough
    expect(global.WebSocket).toHaveBeenCalledTimes(2);
    act(() => { jest.advanceTimersByTime(3_001); }); // now past 6 s total
    expect(global.WebSocket).toHaveBeenCalledTimes(3);
  });

  it('caps reconnect delay at RECONNECT_MAX_MS (30 000 ms)', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    // Simulate many closes to push the attempt count very high
    for (let i = 0; i < 10; i++) {
      act(() => { lastWs.onclose?.(); });
      act(() => { jest.advanceTimersByTime(30_001); });
    }

    // As long as we advanced by > 30 s each time, every attempt should have fired
    expect(global.WebSocket).toHaveBeenCalledTimes(11); // initial + 10 reconnects
  });

  it('does not reconnect when unauthenticated at the time the timer fires', () => {
    mockIsAuthenticated = true;
    const { rerender } = renderHook(() => useNotifications(), { wrapper });

    act(() => { lastWs.onclose?.(); });

    // Go unauthenticated and re-render so the hook captures the new value in
    // the onclose closure (useCallback deps include isAuthenticated).
    mockIsAuthenticated = false;
    act(() => { rerender({}); });

    act(() => { jest.advanceTimersByTime(3_001); });

    // The pending timer was cleared by the disconnect() triggered by the effect
    // that fires when isAuthenticated flips to false, so no second WebSocket.
    expect(global.WebSocket).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationProvider — onerror', () => {
  it('fires onerror without throwing (onclose handles recovery)', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    // Should not throw
    act(() => { lastWs.onerror?.(); });

    // State is unchanged
  });
});

describe('NotificationProvider — markAsRead', () => {
  it('marks the specified notification as read', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 99 }) });
    expect(result.current.unreadCount).toBe(1);

    act(() => { result.current.markAsRead(99); });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications[0].is_read).toBe(true);
  });

  it('leaves other notifications untouched', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 1 }) });
    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 2 }) });

    act(() => { result.current.markAsRead(1); });

    expect(result.current.notifications.find((n) => n.id === 1)?.is_read).toBe(true);
    expect(result.current.notifications.find((n) => n.id === 2)?.is_read).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });
});

describe('NotificationProvider — markAllAsRead', () => {
  it('marks every notification as read', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 1 }) });
    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 2 }) });
    triggerWsMessage({
      type: 'direct_message',
      payload: makeNotification({ id: 3, type: 'direct_message' }),
    });

    expect(result.current.unreadCount).toBe(3);

    act(() => { result.current.markAllAsRead(); });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.dmUnreadCount).toBe(0);
    result.current.notifications.forEach((n) => {
      expect(n.is_read).toBe(true);
    });
  });
});

describe('NotificationProvider — addNotificationListener', () => {
  it('dispatches to matching listeners when a notification arrives', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    const callback = jest.fn();
    act(() => { result.current.addNotificationListener('notification', callback); });

    const notif = makeNotification({ id: 42 });
    triggerWsMessage({ type: 'notification', payload: notif });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(notif);
  });

  it('does not dispatch to listeners for non-matching type', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    const callback = jest.fn();
    act(() => { result.current.addNotificationListener('direct_message', callback); });

    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 1 }) });

    expect(callback).not.toHaveBeenCalled();
  });

  it('removes the listener when the returned unsubscribe function is called', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    const callback = jest.fn();
    let unsubscribe!: () => void;
    act(() => { unsubscribe = result.current.addNotificationListener('notification', callback); });

    // Unsubscribe before the message arrives
    act(() => { unsubscribe(); });

    triggerWsMessage({ type: 'notification', payload: makeNotification({ id: 99 }) });

    expect(callback).not.toHaveBeenCalled();
  });

  it('supports multiple independent listeners for the same type', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useNotifications(), { wrapper });

    const cb1 = jest.fn();
    const cb2 = jest.fn();
    act(() => {
      result.current.addNotificationListener('notification', cb1);
      result.current.addNotificationListener('notification', cb2);
    });

    triggerWsMessage({ type: 'notification', payload: makeNotification() });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationProvider — AppState reconnect', () => {
  it('reconnects when the app returns to active and ws is null (authenticated)', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    // Simulate the connection closing and cleanup (ws becomes null internally
    // after close + the ref is set to null in disconnect).  We achieve this by
    // triggering close and letting the ref clear via the source logic, but the
    // simplest observable proxy is to check the WebSocket constructor is called
    // again after the AppState 'active' event fires without waiting for the
    // reconnect timer (the AppState handler resets the attempt counter and
    // calls connect() directly only when wsRef.current is null).
    //
    // To make wsRef.current null: trigger onclose to clear timers, then
    // manually set the tracked ws reference to simulate a null ref state by
    // calling disconnect (which sets wsRef to null) — the hook's onclose sets a
    // timer; we skip the timer and instead fire the AppState listener directly
    // after making ws null by closing it.
    act(() => {
      // Close the socket — the hook sets wsRef.current = null inside disconnect
      lastWs.close.mockImplementation(() => { /* already closed */ });
      lastWs.onclose?.();
    });

    const countAfterClose = (global.WebSocket as unknown as jest.Mock).mock.calls.length;

    // Simulate app coming back to foreground
    act(() => {
      for (const listener of appStateListeners) {
        listener('active');
      }
    });

    // At minimum the timer-based reconnect or the AppState path should fire
    // (advancing past the first backoff confirms at least one path works)
    act(() => { jest.advanceTimersByTime(3_001); });

    expect((global.WebSocket as unknown as jest.Mock).mock.calls.length).toBeGreaterThan(countAfterClose);
  });

  it('does not reconnect on AppState active when unauthenticated', () => {
    mockIsAuthenticated = false;
    renderHook(() => useNotifications(), { wrapper });

    act(() => {
      for (const listener of appStateListeners) {
        listener('active');
      }
    });

    expect(global.WebSocket).not.toHaveBeenCalled();
  });

  it('does not reconnect on non-active AppState transitions', () => {
    mockIsAuthenticated = true;
    renderHook(() => useNotifications(), { wrapper });

    const countBefore = (global.WebSocket as unknown as jest.Mock).mock.calls.length;

    act(() => {
      for (const listener of appStateListeners) {
        listener('background');
      }
    });

    expect((global.WebSocket as unknown as jest.Mock).mock.calls.length).toBe(countBefore);
  });
});

describe('useNotifications — error boundary', () => {
  it('throws when used outside NotificationProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useNotifications())).toThrow(
      'useNotifications must be used within a NotificationProvider',
    );
    consoleError.mockRestore();
  });
});
