import React, { useEffect } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any module imports that transitively
// import the mocked modules.
// ---------------------------------------------------------------------------

const { mockGetNotifications, mockGetUnreadCount, mockGetUnreadMessageCount, mockMarkAsRead, mockMarkAllAsRead } = vi.hoisted(() => ({
  mockGetNotifications: vi.fn(),
  mockGetUnreadCount: vi.fn(),
  mockGetUnreadMessageCount: vi.fn(),
  mockMarkAsRead: vi.fn(),
  mockMarkAllAsRead: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  getNotifications: mockGetNotifications,
  getUnreadCount: mockGetUnreadCount,
  markNotificationAsRead: mockMarkAsRead,
  markAllNotificationsAsRead: mockMarkAllAsRead,
  getUnreadMessageCount: mockGetUnreadMessageCount,
}));

const { mockIsAuthenticated, mockUser } = vi.hoisted(() => ({
  mockIsAuthenticated: { value: true },
  mockUser: { value: { id: 1 } },
}));

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: mockIsAuthenticated.value,
    user: mockUser.value,
  })),
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import { NotificationProvider, useNotifications } from '../NotificationContext';

// ---------------------------------------------------------------------------
// MockWebSocket — captures instances so tests can manipulate them directly.
// ---------------------------------------------------------------------------

let wsInstances = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose();
    });
    wsInstances.push(this);
  }

  /** Simulate the server accepting the connection. */
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  /** Simulate an inbound message from the server. */
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  /** Simulate an unexpected connection drop (not triggered by ws.close()). */
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

// Keep instance-level constants in sync with the static ones so checks like
// `ws.readyState === WebSocket.OPEN` inside the context work correctly when
// the global WebSocket is replaced.
MockWebSocket.prototype.CONNECTING = 0;
MockWebSocket.prototype.OPEN = 1;
MockWebSocket.prototype.CLOSING = 2;
MockWebSocket.prototype.CLOSED = 3;

// ---------------------------------------------------------------------------
// Consumer component
// ---------------------------------------------------------------------------

function WsConsumer() {
  const ctx = useNotifications();
  return (
    <div>
      <span data-testid="ws-connected">{String(ctx.wsConnected)}</span>
      <span data-testid="unread">{ctx.unreadCount}</span>
      <span data-testid="dm-unread">{ctx.dmUnreadCount}</span>
      <span data-testid="count">{ctx.notifications.length}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  wsInstances = [];

  vi.stubGlobal('WebSocket', MockWebSocket);
  localStorage.setItem('beach_access_token', 'test-token');

  // Mock the /api/backend-url endpoint used by getBackendHostForWebSocket.
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ url: 'localhost:8000' }),
      })
    )
  );

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  mockIsAuthenticated.value = true;
  mockUser.value = { id: 1 };

  mockGetNotifications.mockResolvedValue({ items: [], total_count: 0 });
  mockGetUnreadCount.mockResolvedValue({ count: 0 });
  mockGetUnreadMessageCount.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Helper: render the provider and flush the async IIFE inside connectWebSocket.
// ---------------------------------------------------------------------------

async function renderAndFlush() {
  render(
    <NotificationProvider>
      <WsConsumer />
    </NotificationProvider>
  );

  // Let the async IIFE inside connectWebSocket resolve (fetch + new WebSocket).
  await act(async () => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationContext — WebSocket lifecycle', () => {
  describe('connection establishment', () => {
    it('creates a WebSocket instance when the user is authenticated', async () => {
      await renderAndFlush();

      expect(wsInstances.length).toBeGreaterThan(0);
    });

    it('sends the access token as the first message after connection', async () => {
      await renderAndFlush();

      expect(wsInstances.length).toBeGreaterThan(0);
      expect(wsInstances[0].url).not.toContain('test-token');

      // Simulate server accepting the connection — triggers onopen which sends auth
      await act(async () => { wsInstances[0].simulateOpen(); });

      const sendCalls = wsInstances[0].send.mock.calls;
      const authCall = sendCalls.find(([msg]: [string]) => {
        try { return JSON.parse(msg).type === 'auth'; } catch { return false; }
      });
      expect(authCall).toBeDefined();
      expect(JSON.parse(authCall[0]).token).toBe('test-token');
    });

    it('does not create a WebSocket when no token is present in localStorage', async () => {
      localStorage.removeItem('beach_access_token');

      await renderAndFlush();

      expect(wsInstances).toHaveLength(0);
    });

    it('does not create a WebSocket when the user is not authenticated', async () => {
      mockIsAuthenticated.value = false;
      mockUser.value = null;

      await renderAndFlush();

      expect(wsInstances).toHaveLength(0);
    });
  });

  describe('onopen', () => {
    it('sets wsConnected to true when the connection opens', async () => {
      await renderAndFlush();

      const ws = wsInstances[0];

      await act(async () => {
        ws.simulateOpen();
      });

      expect(screen.getByTestId('ws-connected').textContent).toBe('true');
    });
  });

  describe('onmessage — ping/pong', () => {
    it('responds with "pong" when it receives a "ping" message', async () => {
      await renderAndFlush();

      const ws = wsInstances[0];
      ws.simulateOpen();

      await act(async () => {
        ws.simulateMessage('ping');
      });

      expect(ws.send).toHaveBeenCalledWith('pong');
    });
  });

  describe('onmessage — notification (new)', () => {
    it('prepends the notification and increments unreadCount when is_read is false', async () => {
      await renderAndFlush();

      const ws = wsInstances[0];
      ws.simulateOpen();

      await act(async () => {
        ws.simulateMessage({ type: 'notification', notification: { id: 1, is_read: false } });
      });

      expect(screen.getByTestId('count').textContent).toBe('1');
      expect(screen.getByTestId('unread').textContent).toBe('1');
    });

    it('prepends the notification but does NOT increment unreadCount when is_read is true', async () => {
      await renderAndFlush();

      const ws = wsInstances[0];
      ws.simulateOpen();

      await act(async () => {
        ws.simulateMessage({ type: 'notification', notification: { id: 2, is_read: true } });
      });

      expect(screen.getByTestId('count').textContent).toBe('1');
      expect(screen.getByTestId('unread').textContent).toBe('0');
    });
  });

  describe('onmessage — notification_updated', () => {
    it('moves an existing notification to the top when is_read is false', async () => {
      // Seed the notification list via an initial new-notification message.
      await renderAndFlush();

      const ws = wsInstances[0];
      ws.simulateOpen();

      // Add an existing notification.
      await act(async () => {
        ws.simulateMessage({ type: 'notification', notification: { id: 1, is_read: false } });
      });

      // Send an update for the same notification.
      await act(async () => {
        ws.simulateMessage({
          type: 'notification_updated',
          notification: { id: 1, is_read: false, body: 'updated' },
        });
      });

      // Still only one notification in the list (replaced, not duplicated).
      expect(screen.getByTestId('count').textContent).toBe('1');
    });

    it('treats a notification_updated for an unknown id as a new entry when is_read is false', async () => {
      await renderAndFlush();

      const ws = wsInstances[0];
      ws.simulateOpen();

      await act(async () => {
        ws.simulateMessage({
          type: 'notification_updated',
          notification: { id: 99, is_read: false },
        });
      });

      expect(screen.getByTestId('count').textContent).toBe('1');
    });

    it('does not add a notification_updated entry when id is unknown and is_read is true', async () => {
      await renderAndFlush();

      const ws = wsInstances[0];
      ws.simulateOpen();

      await act(async () => {
        ws.simulateMessage({
          type: 'notification_updated',
          notification: { id: 99, is_read: true },
        });
      });

      // Unknown + already-read → list unchanged.
      expect(screen.getByTestId('count').textContent).toBe('0');
    });
  });

  describe('onmessage — direct_message', () => {
    it('calls fetchDmUnreadCount when a direct_message event arrives', async () => {
      await renderAndFlush();

      const ws = wsInstances[0];
      ws.simulateOpen();

      await act(async () => {
        ws.simulateMessage({
          type: 'direct_message',
          message: { id: 10, sender_id: 2, body: 'hey' },
        });
      });

      expect(mockGetUnreadMessageCount).toHaveBeenCalled();
    });
  });

  describe('reconnect on unexpected close', () => {
    it('schedules a reconnect attempt after an unexpected close', async () => {
      await renderAndFlush();

      const ws = wsInstances[0];
      ws.simulateOpen();

      await act(async () => {
        ws.simulateClose();
      });

      // Advance past the first reconnect delay (3 s base).
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // A second WebSocket instance should have been created.
      expect(wsInstances).toHaveLength(2);
    });

    it('applies exponential backoff: second consecutive close (without open) uses 6 s delay', async () => {
      await renderAndFlush();

      const ws1 = wsInstances[0];
      // Do NOT call simulateOpen — reconnectAttempts stays at 0.
      // First close: delay = 3000 * 2^0 = 3000 ms, attempts becomes 1.
      await act(async () => {
        ws1.simulateClose();
      });

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // Flush the async IIFE for the second connection attempt.
      await act(async () => {});

      expect(wsInstances).toHaveLength(2);

      const ws2 = wsInstances[1];
      // Still no simulateOpen — reconnectAttempts is now 1.
      // Second close: delay = 3000 * 2^1 = 6000 ms, attempts becomes 2.
      await act(async () => {
        ws2.simulateClose();
      });

      // At 3 s into the wait there should still only be 2 instances.
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(wsInstances).toHaveLength(2);

      // At 6 s total (another 3 s) the third instance should appear.
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(wsInstances).toHaveLength(3);
    });
  });

  describe('intentional disconnect', () => {
    it('does not reconnect after disconnectWebSocket is called', async () => {
      const ctxRef = { current: null as ReturnType<typeof useNotifications> | null };

      function CapturingConsumer() {
        const notifications = useNotifications();
        useEffect(() => { ctxRef.current = notifications; });
        return <WsConsumer />;
      }

      render(
        <NotificationProvider>
          <CapturingConsumer />
        </NotificationProvider>
      );

      await act(async () => {});

      const ws = wsInstances[0];
      ws.simulateOpen();

      await act(async () => {
        ctxRef.current!.disconnectWebSocket();
      });

      // Advance well past any reconnect window.
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      // Still only one WebSocket was ever created.
      expect(wsInstances).toHaveLength(1);
      expect(screen.getByTestId('ws-connected').textContent).toBe('false');
    });
  });
});
