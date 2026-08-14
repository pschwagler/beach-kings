import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNotifications } from '@/features/notifications/useNotifications';
import { api } from '@/lib/api';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
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

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
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
    });
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
});
