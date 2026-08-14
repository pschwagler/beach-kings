import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFriendshipMutations } from '@/features/social/useFriendshipMutations';
import { socialKeys } from '@/features/social/keys';
import { notificationKeys } from '@/features/notifications/keys';
import { reconcileNotificationEvent } from '@/features/notifications/cache';
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
    removeFriend: jest.fn(),
  },
}));

const mockSend = api.sendFriendRequest as jest.Mock;
const mockAccept = api.acceptFriendRequest as jest.Mock;
const mockRemove = api.removeFriend as jest.Mock;

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  client.setQueryData(
    socialKeys.relationship(7, 44),
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
      socialKeys.relationship(7, 44),
    )).toEqual({ status: 'pending_outgoing', request_id: null }));
  });

  it('rolls the relationship cache back when sending fails', async () => {
    mockSend.mockRejectedValue(new Error('network'));
    const { client, Wrapper } = setup();
    const { result } = renderHook(() => useFriendshipMutations(), { wrapper: Wrapper });

    act(() => result.current.send.mutate(44));

    await waitFor(() => expect(client.getQueryData(
      socialKeys.relationship(7, 44),
    )).toEqual({ status: 'none', request_id: null }));
  });

  it('removes an optimistic relationship that was absent before failure', async () => {
    let rejectRequest: (reason: Error) => void = () => {};
    mockSend.mockReturnValue(new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));
    const { client, Wrapper } = setup();
    client.removeQueries({ queryKey: socialKeys.relationship(7, 44) });
    const { result } = renderHook(() => useFriendshipMutations(), { wrapper: Wrapper });

    act(() => result.current.send.mutate(44));

    await waitFor(() => expect(client.getQueryData(
      socialKeys.relationship(7, 44),
    )).toEqual({ status: 'pending_outgoing', request_id: null }));
    act(() => rejectRequest(new Error('network')));

    await waitFor(() => expect(client.getQueryData(
      socialKeys.relationship(7, 44),
    )).toBeUndefined());
  });

  it('preserves a relationship update that arrives before send fails', async () => {
    let rejectRequest: (reason: Error) => void = () => {};
    mockSend.mockReturnValue(new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));
    const { client, Wrapper } = setup();
    const { result } = renderHook(() => useFriendshipMutations(), { wrapper: Wrapper });

    act(() => result.current.send.mutate(44));
    await waitFor(() => expect(client.getQueryData(
      socialKeys.relationship(7, 44),
    )).toMatchObject({ status: 'pending_outgoing' }));
    const authoritative = { status: 'friend', request_id: null };
    client.setQueryData(socialKeys.relationship(7, 44), authoritative);
    act(() => rejectRequest(new Error('network')));

    await waitFor(() => expect(client.getQueryData(
      socialKeys.relationship(7, 44),
    )).toEqual(authoritative));
  });

  it('restores only the failed request while preserving socket notifications', async () => {
    let rejectRequest: (reason: Error) => void = () => {};
    mockAccept.mockReturnValue(new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));
    const { client, Wrapper } = setup();
    client.setQueryData(socialKeys.requests(7, 'incoming'), [{
      id: 22,
      sender_player_id: 44,
      sender_name: 'Taylor',
      sender_avatar: null,
      receiver_player_id: 7,
      receiver_name: 'Pat',
      receiver_avatar: null,
      status: 'pending',
      created_at: null,
      mutual_friends_count: 0,
      shared_league_name: null,
    }]);
    const requestNotification = {
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
    client.setQueryData(notificationKeys.feed(7), [requestNotification]);
    client.setQueryData(notificationKeys.unreadCount(7), { count: 9 });
    const { result } = renderHook(() => useFriendshipMutations(), { wrapper: Wrapper });

    act(() => result.current.accept.mutate({ requestId: 22, notificationId: 4 }));
    await waitFor(() => expect(
      client.getQueryData<typeof requestNotification[]>(notificationKeys.feed(7))
        ?.filter((notification) => notification.dismissed_at == null),
    ).toHaveLength(0));
    reconcileNotificationEvent(client, 7, 'notification', {
      ...requestNotification,
      id: 5,
      data: { request_id: 23 },
    });
    act(() => rejectRequest(new Error('network')));

    await waitFor(() => expect(
      client.getQueryData<typeof requestNotification[]>(notificationKeys.feed(7))
        ?.map((notification) => notification.id),
    ).toEqual([5, 4]));
    expect(client.getQueryData<{ count: number }>(notificationKeys.unreadCount(7)))
      .toMatchObject({ count: 10 });
  });

  it('optimistically removes a friend and restores it after a network failure', async () => {
    let rejectRemoval: (reason: Error) => void = () => {};
    mockRemove.mockReturnValue(new Promise((_resolve, reject) => {
      rejectRemoval = reject;
    }));
    const { client, Wrapper } = setup();
    const friend = {
      id: 9,
      player_id: 44,
      full_name: 'Taylor',
      avatar: null,
      location_name: null,
      level: null,
    };
    client.setQueryData(socialKeys.relationship(7, 44), {
      status: 'friend',
      request_id: null,
    });
    client.setQueryData(socialKeys.friends(7), [friend]);
    client.setQueryData(socialKeys.friendCount(7), 1);
    const { result } = renderHook(() => useFriendshipMutations(), {
      wrapper: Wrapper,
    });

    act(() => result.current.remove.mutate(44));
    await waitFor(() => {
      expect(client.getQueryData(socialKeys.relationship(7, 44))).toEqual({
        status: 'none',
        request_id: null,
      });
      expect(client.getQueryData(socialKeys.friends(7))).toEqual([]);
      expect(client.getQueryData(socialKeys.friendCount(7))).toBe(0);
    });

    act(() => rejectRemoval(new Error('network')));
    await waitFor(() => {
      expect(client.getQueryData(socialKeys.relationship(7, 44))).toEqual({
        status: 'friend',
        request_id: null,
      });
      expect(client.getQueryData(socialKeys.friends(7))).toEqual([friend]);
      expect(client.getQueryData(socialKeys.friendCount(7))).toBe(1);
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it('keeps the removed state when the server says they are already not friends', async () => {
    mockRemove.mockRejectedValue(Object.assign(new Error('bad request'), {
      response: { data: { detail: 'Not friends with this player' } },
    }));
    const { client, Wrapper } = setup();
    client.setQueryData(socialKeys.relationship(7, 44), {
      status: 'friend',
      request_id: null,
    });
    const { result } = renderHook(() => useFriendshipMutations(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(result.current.remove.mutateAsync(44)).rejects.toThrow(
        'bad request',
      );
    });
    expect(client.getQueryData(
      socialKeys.relationship(7, 44),
    )).toEqual({ status: 'none', request_id: null });
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });
});
