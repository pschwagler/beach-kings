import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('@/lib/api', () => ({
  api: {
    getPublicPlayer: jest.fn(),
    getMutualFriends: jest.fn(),
    getPlayerLeagues: jest.fn(),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1 },
    isAuthenticated: true,
  }),
}));

jest.mock('@/hooks/usePlayerRelationshipQuery', () => ({
  usePlayerRelationshipQuery: jest.fn(),
}));

jest.mock('@/hooks/useFriendshipMutations', () => ({
  useFriendshipMutations: jest.fn(),
}));

import { api } from '@/lib/api';
import { useFriendshipMutations } from '@/hooks/useFriendshipMutations';
import { usePlayerRelationshipQuery } from '@/hooks/usePlayerRelationshipQuery';
import { usePlayerProfileScreen } from '../usePlayerProfileScreen';

const mockApi = api as unknown as {
  getPublicPlayer: jest.Mock;
  getMutualFriends: jest.Mock;
  getPlayerLeagues: jest.Mock;
};
const mockRelationshipQuery = usePlayerRelationshipQuery as jest.Mock;
const mockFriendshipMutations = useFriendshipMutations as jest.Mock;

const PLAYER_ID = 42;
const FAKE_PLAYER = {
  id: PLAYER_ID,
  first_name: 'Alice',
  last_name: 'Smith',
  name: 'Alice Smith',
};
const FAKE_LEAGUES = [
  { id: 1, name: 'QBK Open Men', rank: 2, games_played: 30 },
  { id: 5, name: 'NYC Fun League', rank: null, games_played: 0 },
];
const noop = () => {};

const send = { mutateAsync: jest.fn(), isPending: false };
const accept = { mutateAsync: jest.fn(), isPending: false };
const decline = { mutateAsync: jest.fn(), isPending: false };
const cancel = { mutateAsync: jest.fn(), isPending: false };

function renderProfileHook(playerId: string | number = PLAYER_ID) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return renderHook(() => usePlayerProfileScreen(playerId, noop), {
    wrapper: ({ children }) => React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getPublicPlayer.mockResolvedValue(FAKE_PLAYER);
  mockApi.getMutualFriends.mockResolvedValue([]);
  mockApi.getPlayerLeagues.mockResolvedValue(FAKE_LEAGUES);
  mockRelationshipQuery.mockReturnValue({
    data: { status: 'none', request_id: null },
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
  });
  mockFriendshipMutations.mockReturnValue({ send, accept, decline, cancel });
  send.mutateAsync.mockResolvedValue(undefined);
  accept.mutateAsync.mockResolvedValue(undefined);
  decline.mutateAsync.mockResolvedValue(undefined);
});

describe('usePlayerProfileScreen', () => {
  it('loads profile details with a numeric player ID', async () => {
    const { result } = renderProfileHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApi.getPublicPlayer).toHaveBeenCalledWith(PLAYER_ID);
    expect(mockApi.getPlayerLeagues).toHaveBeenCalledWith(PLAYER_ID);
    expect(result.current.profileData?.leagues).toEqual(FAKE_LEAGUES);
  });

  it('converts a string player ID before querying', async () => {
    const { result } = renderProfileHook(String(PLAYER_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApi.getPlayerLeagues).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('falls back to optional empty profile collections', async () => {
    mockApi.getMutualFriends.mockRejectedValue(new Error('network'));
    mockApi.getPlayerLeagues.mockRejectedValue(new Error('network'));
    const { result } = renderProfileHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profileData?.mutualFriends).toEqual([]);
    expect(result.current.profileData?.leagues).toEqual([]);
    expect(result.current.profileData?.player).toEqual(FAKE_PLAYER);
  });

  it('identifies a hidden or zero-game profile 404', async () => {
    const notFound = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    mockApi.getPublicPlayer.mockRejectedValue(notFound);
    const { result } = renderProfileHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(notFound);
    expect(result.current.isNotFound).toBe(true);
  });

  it.each([
    'self',
    'none',
    'friend',
    'pending_outgoing',
    'pending_incoming',
  ] as const)('preserves the canonical %s relationship state', async (status) => {
    mockRelationshipQuery.mockReturnValue({
      data: { status, request_id: status.startsWith('pending') ? 88 : null },
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn().mockResolvedValue(undefined),
    });
    const { result } = renderProfileHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profileData?.friendStatus).toBe(status);
  });

  it('uses the canonical request ID for Accept and Decline', async () => {
    mockRelationshipQuery.mockReturnValue({
      data: { status: 'pending_incoming', request_id: 88 },
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn().mockResolvedValue(undefined),
    });
    const { result } = renderProfileHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onAcceptFriend();
      await result.current.onDeclineFriend();
    });

    expect(accept.mutateAsync).toHaveBeenCalledWith({
      requestId: 88,
      playerId: PLAYER_ID,
    });
    expect(decline.mutateAsync).toHaveBeenCalledWith({
      requestId: 88,
      playerId: PLAYER_ID,
    });
  });

  it('sends a friend request through the shared mutation', async () => {
    const { result } = renderProfileHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.onAddFriend());
    expect(send.mutateAsync).toHaveBeenCalledWith(PLAYER_ID);
  });
});
