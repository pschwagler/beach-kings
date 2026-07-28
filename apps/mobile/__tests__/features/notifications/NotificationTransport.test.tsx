import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationTransport from '@/features/notifications/NotificationTransport';
import useWebSocket from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { messageKeys } from '@/features/messages';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 7 },
  }),
}));

jest.mock('@/hooks/useWebSocket', () => jest.fn());

jest.mock('@/lib/api', () => ({
  api: {
    getStoredTokens: jest.fn(),
  },
}));

const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;
const mockGetStoredTokens = api.getStoredTokens as jest.Mock;

describe('NotificationTransport', () => {
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
    const client = new QueryClient();

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
    const client = new QueryClient();
    client.setQueryData(messageKeys.unreadCount(7), { count: 0 });

    render(
      <QueryClientProvider client={client}>
        <NotificationTransport />
      </QueryClientProvider>,
    );

    const latestCall =
      mockUseWebSocket.mock.calls[mockUseWebSocket.mock.calls.length - 1];
    const options = latestCall?.[0];
    act(() => {
      options?.onMessage?.({
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
      });
    });

    expect(
      client.getQueryData<{ count: number }>(messageKeys.unreadCount(7)),
    ).toEqual(expect.objectContaining({ count: 1 }));
  });
});
