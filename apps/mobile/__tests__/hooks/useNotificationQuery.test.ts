import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNotifications } from '@/features/notifications/useNotifications';
import { notificationKeys } from '@/features/notifications/keys';
import { api } from '@/lib/api';

let mockUserId = 7;
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: mockUserId }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getNotifications: jest.fn(),
    getUnreadNotificationCount: jest.fn(),
    getDmUnreadCount: jest.fn(),
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;

function createWrapper(client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })) {
  return function Wrapper({ children }: { readonly children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

const notification = {
  id: 4,
  user_id: 7,
  type: 'friend_request' as const,
  title: 'Request',
  message: 'A request',
  data: { request_id: 22 },
  is_read: false,
  read_at: null,
  dismissed_at: null,
  link_url: null,
  created_at: '2026-07-18T12:00:00Z',
};

const readNotification = {
  ...notification,
  id: 5,
  is_read: true,
  read_at: '2026-07-18T12:05:00Z',
};

const dismissedNotification = {
  ...notification,
  id: 6,
  dismissed_at: '2026-07-18T12:06:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 7;
  mockApi.getNotifications.mockResolvedValue([
    notification,
    readNotification,
    dismissedNotification,
  ]);
  mockApi.getUnreadNotificationCount.mockResolvedValue({ count: 9 });
  mockApi.getDmUnreadCount.mockResolvedValue({ count: 3 });
  mockApi.markNotificationRead.mockReturnValue(new Promise(() => {}));
  mockApi.markAllNotificationsRead.mockReturnValue(new Promise(() => {}));
});

describe('useNotifications', () => {
  it('hydrates an unread inbox and uses the server total for badges', async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.unreadCount).toBe(9));
    await waitFor(() => expect(result.current.dmUnreadCount).toBe(3));
    expect(result.current.notifications).toEqual([notification]);
    expect(mockApi.getNotifications).toHaveBeenCalledWith({
      unreadOnly: true,
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('optimistically synchronizes feed and total count when marking read', async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(9));

    act(() => result.current.markAsRead(notification.id));

    await waitFor(() => expect(result.current.unreadCount).toBe(8));
    expect(result.current.notifications).toEqual([]);
  });

  it('optimistically clears both feed unread state and the badge total', async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(9));

    act(() => result.current.markAllAsRead());

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.notifications).toEqual([]);
  });

  it('keeps public handlers stable across Query and mutation rerenders', async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(9));
    const markAsRead = result.current.markAsRead;
    const markAllAsRead = result.current.markAllAsRead;
    const refetch = result.current.refetch;

    act(() => result.current.markAsRead(notification.id));
    await waitFor(() => expect(result.current.unreadCount).toBe(8));

    expect(result.current.markAsRead).toBe(markAsRead);
    expect(result.current.markAllAsRead).toBe(markAllAsRead);
    expect(result.current.refetch).toBe(refetch);
  });

  it('settles Mark all when background invalidation never settles', async () => {
    mockApi.markAllNotificationsRead.mockResolvedValue({ success: true, count: 9 });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(9));
    jest.spyOn(client, 'invalidateQueries').mockReturnValue(new Promise(() => {}));

    await act(async () => {
      await expect(result.current.markAllAsReadAsync()).resolves.toMatchObject({
        success: true,
      });
    });
  });

  it('keeps a late Mark all completion scoped to the account that started it', async () => {
    let resolveAccountA!: (value: { success: boolean; count: number }) => void;
    mockApi.markAllNotificationsRead.mockReturnValueOnce(new Promise((resolve) => {
      resolveAccountA = resolve;
    }));
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    const { result, rerender } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(9));

    let accountAWork!: Promise<unknown>;
    act(() => { accountAWork = result.current.markAllAsReadAsync(); });
    await waitFor(() => expect(mockApi.markAllNotificationsRead).toHaveBeenCalledTimes(1));

    client.clear();
    mockUserId = 8;
    const accountBNotification = { ...notification, id: 44, user_id: 8 };
    mockApi.getNotifications.mockResolvedValue([accountBNotification]);
    mockApi.getUnreadNotificationCount.mockResolvedValue({ count: 1 });
    rerender(undefined);
    await waitFor(() => expect(result.current.notifications).toEqual([accountBNotification]));

    resolveAccountA({ success: true, count: 9 });
    await act(async () => { await accountAWork; });

    expect(result.current.notifications).toEqual([accountBNotification]);
    expect(client.getQueryData(notificationKeys.feed(7))).toBeUndefined();
  });
});
