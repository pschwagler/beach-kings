import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationTransport from '@/features/notifications/NotificationTransport';
import useWebSocket from '@/hooks/useWebSocket';
import { api } from '@/lib/api';

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
});
