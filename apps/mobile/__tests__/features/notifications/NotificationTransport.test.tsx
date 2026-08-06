import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationTransport from '@/features/notifications/NotificationTransport';
import useWebSocket from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { messageKeys } from '@/features/messages';
import { privateKeys } from '@/infrastructure/query/keys';
import { moderationKeys } from '@/features/moderation';

const mockRefreshUser = jest.fn(() => Promise.resolve());

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 7 },
    refreshUser: mockRefreshUser,
  }),
}));

jest.mock('@/hooks/useWebSocket', () => jest.fn());

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/features/notifications/useNotifications', () => ({
  useNotifications: () => ({ markAsRead: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getStoredTokens: jest.fn(),
  },
}));

const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;
const mockGetStoredTokens = api.getStoredTokens as jest.Mock;

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

describe('NotificationTransport', () => {
  beforeEach(() => {
    mockRefreshUser.mockClear();
  });
  it('authenticates an open socket with the stored access token', async () => {
    const send = jest.fn();
    mockUseWebSocket.mockReturnValue({
      isConnected: true,
      lastMessage: null,
      send,
    });
    mockGetStoredTokens.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    const client = makeClient();

    render(
      <QueryClientProvider client={client}>
        <NotificationTransport />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(send).toHaveBeenCalledWith({
      type: 'auth',
      token: 'access-token',
    }));
  });

  it('routes direct-message socket events into the message Query cache', async () => {
    mockUseWebSocket.mockReturnValue({
      isConnected: false,
      lastMessage: null,
      send: jest.fn(),
    });
    const client = makeClient();
    client.setQueryData(messageKeys.conversations(7), {
      items: [
        {
          player_id: 42,
          full_name: 'Alex Torres',
          avatar: null,
          last_message_text: null,
          last_message_at: null,
          last_message_sender_id: null,
          unread_count: 0,
          is_friend: true,
        },
      ],
      total_count: 1,
    });
    client.setQueryData(messageKeys.thread(7, 42), {
      items: [],
      total_count: 0,
      has_more: false,
    });
    client.setQueryData(messageKeys.unreadCount(7), { count: 0 });

    render(
      <QueryClientProvider client={client}>
        <NotificationTransport />
      </QueryClientProvider>,
    );

    const latestCall =
      mockUseWebSocket.mock.calls[mockUseWebSocket.mock.calls.length - 1];
    const options = latestCall?.[0];
    const event = {
      type: 'direct_message',
      message: {
        id: 90,
        sender_player_id: 42,
        receiver_player_id: 9,
        message_text: 'Socket message',
        is_read: false,
        read_at: null,
        created_at: '2026-07-25T12:00:00Z',
      },
    };
    act(() => {
      options?.onMessage?.(event);
      options?.onMessage?.(event);
    });

    expect(
      client.getQueryData<{ count: number }>(messageKeys.unreadCount(7)),
    ).toEqual(expect.objectContaining({ count: 1 }));
    expect(
      client.getQueryData<{ items: Array<{ id: number }> }>(
        messageKeys.thread(7, 42),
      )?.items.filter((message) => message.id === 90),
    ).toHaveLength(1);
    expect(
      client.getQueryData<{ items: Array<{ unread_count: number }> }>(
        messageKeys.conversations(7),
      )?.items[0]?.unread_count,
    ).toBe(1);
  });

  it('invalidates rather than guessing when a direct-message thread is unhydrated', () => {
    mockUseWebSocket.mockReturnValue({
      isConnected: false,
      lastMessage: null,
      send: jest.fn(),
    });
    const client = makeClient();
    const invalidateQueries = jest.spyOn(client, 'invalidateQueries');
    client.setQueryData(messageKeys.unreadCount(7), { count: 0 });

    render(
      <QueryClientProvider client={client}>
        <NotificationTransport />
      </QueryClientProvider>,
    );

    const latestCall =
      mockUseWebSocket.mock.calls[mockUseWebSocket.mock.calls.length - 1];
    act(() => {
      latestCall?.[0]?.onMessage?.({
        type: 'direct_message',
        message: {
          id: 91,
          sender_player_id: 42,
          receiver_player_id: 9,
          message_text: 'Socket message',
          is_read: false,
          read_at: null,
          created_at: '2026-07-25T12:00:00Z',
        },
      });
    });

    expect(
      client.getQueryData<{ count: number }>(messageKeys.unreadCount(7)),
    ).toEqual(expect.objectContaining({ count: 0 }));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: messageKeys.conversations(7),
      refetchType: 'active',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: messageKeys.unreadCount(7),
      refetchType: 'active',
    });
  });

  it('invalidates the authenticated private cache for a quiet safety event', () => {
    mockUseWebSocket.mockReturnValue({
      isConnected: false,
      lastMessage: null,
      send: jest.fn(),
    });
    const client = makeClient();
    const invalidateQueries = jest.spyOn(client, 'invalidateQueries');

    render(
      <QueryClientProvider client={client}>
        <NotificationTransport />
      </QueryClientProvider>,
    );

    const latestCall =
      mockUseWebSocket.mock.calls[mockUseWebSocket.mock.calls.length - 1];
    act(() => {
      latestCall?.[0]?.onMessage?.({
        type: 'private_data_invalidated',
        roots: ['social', 'messages', 'moderation', 'notifications'],
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: privateKeys.user(7),
    });
  });

  it('refreshes identity when a moderation action arrives', async () => {
    mockUseWebSocket.mockReturnValue({
      isConnected: false,
      lastMessage: null,
      send: jest.fn(),
    });
    const client = makeClient();
    const invalidateQueries = jest.spyOn(client, 'invalidateQueries');

    render(
      <QueryClientProvider client={client}>
        <NotificationTransport />
      </QueryClientProvider>,
    );

    const latestCall = mockUseWebSocket.mock.calls.at(-1);
    act(() => {
      latestCall?.[0]?.onMessage?.({
        type: 'notification',
        notification: {
          id: 31,
          user_id: 7,
          type: 'moderation_update',
          title: 'Safety update',
          message: 'Your account status changed.',
          data: null,
          is_read: false,
          read_at: null,
          link_url: null,
          created_at: '2026-08-06T12:00:00Z',
        },
      });
    });

    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalledTimes(1));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: moderationKeys.accountStatus(7),
    });
  });
});
