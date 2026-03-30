import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

const {
  mockGetNotifications,
  mockGetUnreadCount,
  mockMarkAsRead,
  mockMarkAllAsRead,
  mockGetUnreadMessageCount,
} = vi.hoisted(() => ({
  mockGetNotifications: vi.fn(),
  mockGetUnreadCount: vi.fn(),
  mockMarkAsRead: vi.fn(),
  mockMarkAllAsRead: vi.fn(),
  mockGetUnreadMessageCount: vi.fn(),
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

import { NotificationProvider, useNotifications } from '../NotificationContext';

/** Consumer component that exposes context values via data-testids. */
function NotificationConsumer({ onContext }) {
  const ctx = useNotifications();
  React.useEffect(() => {
    if (onContext) onContext(ctx);
  });
  return (
    <div>
      <span data-testid="unread">{ctx.unreadCount}</span>
      <span data-testid="dm-unread">{ctx.dmUnreadCount}</span>
      <span data-testid="loading">{String(ctx.isLoading)}</span>
      <span data-testid="count">{ctx.notifications.length}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  // Prevent WebSocket connections
  vi.stubGlobal(
    'WebSocket',
    class MockWebSocket {
      constructor() {
        this.readyState = 3; // CLOSED
      }
      close() {}
      send() {}
    },
  );

  // Mock localStorage for token
  localStorage.setItem('beach_access_token', 'test-token');

  // Mock fetch for backend-url resolution
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ url: 'localhost:8000' }),
      }),
    ),
  );

  // Suppress noisy console output
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Default: authenticated
  mockIsAuthenticated.value = true;
  mockUser.value = { id: 1 };

  // Default mock responses
  mockGetNotifications.mockResolvedValue({ items: [], total_count: 0, has_more: false });
  mockGetUnreadCount.mockResolvedValue({ count: 0 });
  mockGetUnreadMessageCount.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('NotificationProvider — initial data fetch', () => {
  it('calls fetchNotifications, fetchUnreadCount, and fetchDmUnreadCount on mount when authenticated', async () => {
    render(
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(1);
    });

    expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);
    expect(mockGetUnreadMessageCount).toHaveBeenCalledTimes(1);
  });

  it('populates notifications from API response', async () => {
    mockGetNotifications.mockResolvedValue({
      items: [
        { id: 1, is_read: false, type: 'test' },
        { id: 2, is_read: true, type: 'test' },
      ],
      total_count: 2,
      has_more: false,
    });

    render(
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
    });
  });

  it('sets unreadCount from API response', async () => {
    mockGetUnreadCount.mockResolvedValue({ count: 5 });

    render(
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('unread').textContent).toBe('5');
    });
  });

  it('sets dmUnreadCount from API response', async () => {
    mockGetUnreadMessageCount.mockResolvedValue({ count: 3 });

    render(
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('dm-unread').textContent).toBe('3');
    });
  });

  it('does not call API functions and keeps state empty when not authenticated', async () => {
    mockIsAuthenticated.value = false;
    mockUser.value = null;

    render(
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>,
    );

    // Allow any async effects to settle
    await act(async () => {});

    expect(mockGetNotifications).not.toHaveBeenCalled();
    expect(mockGetUnreadCount).not.toHaveBeenCalled();
    expect(mockGetUnreadMessageCount).not.toHaveBeenCalled();

    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('unread').textContent).toBe('0');
    expect(screen.getByTestId('dm-unread').textContent).toBe('0');
  });
});

describe('NotificationProvider — isLoading lifecycle', () => {
  it('transitions isLoading from true to false after fetchNotifications resolves', async () => {
    let resolveNotifications;
    mockGetNotifications.mockReturnValue(
      new Promise((resolve) => {
        resolveNotifications = resolve;
      }),
    );

    render(
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>,
    );

    // isLoading should be true while the request is in-flight
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('true');
    });

    // Resolve the pending request
    await act(async () => {
      resolveNotifications({ items: [], total_count: 0, has_more: false });
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
  });
});

describe('NotificationProvider — fetchNotifications error handling', () => {
  it('returns a fallback object and does not throw when fetchNotifications fails', async () => {
    mockGetNotifications.mockRejectedValue(new Error('Network error'));

    let latestCtx;
    render(
      <NotificationProvider>
        <NotificationConsumer onContext={(ctx) => { latestCtx = ctx; }} />
      </NotificationProvider>,
    );

    await waitFor(() => expect(latestCtx).toBeDefined());

    let result;
    await act(async () => {
      result = await latestCtx.fetchNotifications();
    });

    expect(result).toEqual({ items: [], total_count: 0, has_more: false });
    // State should still be empty / loading reset
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });
});

describe('NotificationProvider — markAsRead', () => {
  it('calls the API, marks the notification as read locally, and decrements unreadCount', async () => {
    mockGetNotifications.mockResolvedValue({
      items: [
        { id: 1, is_read: false, type: 'test' },
        { id: 2, is_read: false, type: 'test' },
      ],
      total_count: 2,
      has_more: false,
    });
    mockGetUnreadCount.mockResolvedValue({ count: 2 });
    mockMarkAsRead.mockResolvedValue({ id: 1, is_read: true, read_at: '2026-01-01T00:00:00Z' });

    let latestCtx;
    render(
      <NotificationProvider>
        <NotificationConsumer onContext={(ctx) => { latestCtx = ctx; }} />
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
      expect(screen.getByTestId('unread').textContent).toBe('2');
    });

    await act(async () => {
      await latestCtx.markAsRead(1);
    });

    expect(mockMarkAsRead).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('unread').textContent).toBe('1');
  });

  it('does not decrement unreadCount below 0', async () => {
    mockGetNotifications.mockResolvedValue({
      items: [{ id: 1, is_read: false, type: 'test' }],
      total_count: 1,
      has_more: false,
    });
    // API reports 0 already
    mockGetUnreadCount.mockResolvedValue({ count: 0 });
    mockMarkAsRead.mockResolvedValue({ id: 1, is_read: true, read_at: '2026-01-01T00:00:00Z' });

    let latestCtx;
    render(
      <NotificationProvider>
        <NotificationConsumer onContext={(ctx) => { latestCtx = ctx; }} />
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('unread').textContent).toBe('0');
    });

    await act(async () => {
      await latestCtx.markAsRead(1);
    });

    expect(screen.getByTestId('unread').textContent).toBe('0');
  });
});

describe('NotificationProvider — markAllAsRead', () => {
  it('calls the API, marks all notifications as read locally, and resets unreadCount to 0', async () => {
    mockGetNotifications.mockResolvedValue({
      items: [
        { id: 1, is_read: false, type: 'test' },
        { id: 2, is_read: false, type: 'test' },
      ],
      total_count: 2,
      has_more: false,
    });
    mockGetUnreadCount.mockResolvedValue({ count: 2 });
    mockMarkAllAsRead.mockResolvedValue({ updated: 2 });

    let latestCtx;
    render(
      <NotificationProvider>
        <NotificationConsumer onContext={(ctx) => { latestCtx = ctx; }} />
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('unread').textContent).toBe('2');
    });

    await act(async () => {
      await latestCtx.markAllAsRead();
    });

    expect(mockMarkAllAsRead).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('unread').textContent).toBe('0');
  });
});

describe('useNotifications outside provider', () => {
  it('throws when used outside of NotificationProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<NotificationConsumer />)).toThrow(
      'useNotifications must be used within a NotificationProvider',
    );

    consoleError.mockRestore();
  });
});
