import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFriendshipMutations } from '@/hooks/useFriendshipMutations';
import { socialQueryKeys } from '@/lib/socialQueryKeys';
import { api } from '@/lib/api';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    sendFriendRequest: jest.fn(),
    acceptFriendRequest: jest.fn(),
    declineFriendRequest: jest.fn(),
    cancelFriendRequest: jest.fn(),
  },
}));

const mockSend = api.sendFriendRequest as jest.Mock;

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  client.setQueryData(
    socialQueryKeys.relationship(7, 44),
    { status: 'none', request_id: null },
  );
  function Wrapper({ children }: { readonly children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return { client, Wrapper };
}

describe('useFriendshipMutations relationship cache', () => {
  it('publishes outgoing state immediately for every profile consumer', async () => {
    mockSend.mockReturnValue(new Promise(() => {}));
    const { client, Wrapper } = setup();
    const { result } = renderHook(() => useFriendshipMutations(), { wrapper: Wrapper });

    act(() => result.current.send.mutate(44));

    await waitFor(() => expect(client.getQueryData(
      socialQueryKeys.relationship(7, 44),
    )).toEqual({ status: 'pending_outgoing', request_id: null }));
  });

  it('rolls the relationship cache back when sending fails', async () => {
    mockSend.mockRejectedValue(new Error('network'));
    const { client, Wrapper } = setup();
    const { result } = renderHook(() => useFriendshipMutations(), { wrapper: Wrapper });

    act(() => result.current.send.mutate(44));

    await waitFor(() => expect(client.getQueryData(
      socialQueryKeys.relationship(7, 44),
    )).toEqual({ status: 'none', request_id: null }));
  });

  it('removes an optimistic relationship that was absent before failure', async () => {
    let rejectRequest: (reason: Error) => void = () => {};
    mockSend.mockReturnValue(new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));
    const { client, Wrapper } = setup();
    client.removeQueries({ queryKey: socialQueryKeys.relationship(7, 44) });
    const { result } = renderHook(() => useFriendshipMutations(), { wrapper: Wrapper });

    act(() => result.current.send.mutate(44));

    await waitFor(() => expect(client.getQueryData(
      socialQueryKeys.relationship(7, 44),
    )).toEqual({ status: 'pending_outgoing', request_id: null }));
    act(() => rejectRequest(new Error('network')));

    await waitFor(() => expect(client.getQueryData(
      socialQueryKeys.relationship(7, 44),
    )).toBeUndefined());
  });
});
