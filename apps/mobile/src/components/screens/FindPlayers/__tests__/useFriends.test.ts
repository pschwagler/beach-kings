/**
 * Tests for the shared useFriends hook.
 *
 * Covers:
 *   - Consuming canonical arrays from the API client.
 *   - Suggestions gate (withSuggestions: false must not call the endpoint).
 *   - Decoupled errors: a requests/suggestions failure is non-fatal; only a
 *     friends-list failure is fatal.
 *   - Client-side name filter over the friends list.
 *   - Optimistic accept / decline with rollback on failure.
 *   - Optimistic add-suggestion with rollback on failure.
 */

import React from 'react';
import {
  renderHook as renderQueryHook,
  act,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 123 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getFriends: jest.fn(),
    getFriendRequests: jest.fn(),
    getFriendSuggestions: jest.fn(),
    sendFriendRequest: jest.fn(),
    acceptFriendRequest: jest.fn(),
    declineFriendRequest: jest.fn(),
  },
}));

import { useFriends } from '../useFriends';
import { api } from '@/lib/api';

const mockApi = api as unknown as {
  getFriends: jest.Mock;
  getFriendRequests: jest.Mock;
  getFriendSuggestions: jest.Mock;
  sendFriendRequest: jest.Mock;
  acceptFriendRequest: jest.Mock;
  declineFriendRequest: jest.Mock;
};

function renderHook<Result>(callback: () => Result) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  function Wrapper({ children }: { readonly children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return renderQueryHook(callback, { wrapper: Wrapper });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const FRIEND = {
  id: 1,
  player_id: 30,
  full_name: 'Morgan Davis',
  avatar: null,
  location_name: 'San Diego',
  level: 'A' as const,
};

const FRIEND_2 = {
  id: 2,
  player_id: 31,
  full_name: 'Riley Chen',
  avatar: null,
  location_name: 'Los Angeles',
  level: 'AA' as const,
};

const REQUEST = {
  id: 100,
  sender_player_id: 50,
  sender_name: 'Alex Torres',
  sender_avatar: null,
  receiver_player_id: 0,
  receiver_name: 'Me',
  receiver_avatar: null,
  status: 'pending' as const,
  created_at: '2026-04-19T10:00:00Z',
  mutual_friends_count: 0,
  shared_league_name: null,
};

const SUGGESTION = {
  id: 3,
  player_id: 40,
  full_name: 'Sam Rivera',
  avatar: null,
  location_name: 'San Diego',
  level: 'B' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getFriends.mockResolvedValue([FRIEND, FRIEND_2]);
  mockApi.getFriendRequests.mockResolvedValue([REQUEST]);
  mockApi.getFriendSuggestions.mockResolvedValue([SUGGESTION]);
  mockApi.sendFriendRequest.mockResolvedValue({ status: 'ok' });
  mockApi.acceptFriendRequest.mockResolvedValue({ status: 'ok' });
  mockApi.declineFriendRequest.mockResolvedValue({ status: 'ok' });
});

describe('useFriends — fetching', () => {
  it('consumes canonical friends/requests and fetches suggestions by default', async () => {
    const { result } = renderHook(() => useFriends());

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(result.current.friends).toEqual([FRIEND, FRIEND_2]);
    expect(result.current.friendRequests).toEqual([REQUEST]);
    expect(result.current.suggestions).toEqual([SUGGESTION]);
    expect(mockApi.getFriendRequests).toHaveBeenCalledWith('incoming');
    expect(mockApi.getFriendSuggestions).toHaveBeenCalled();
  });

  it('supports smaller canonical array responses', async () => {
    mockApi.getFriends.mockResolvedValue([FRIEND]);
    mockApi.getFriendRequests.mockResolvedValue([REQUEST]);

    const { result } = renderHook(() => useFriends());

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(result.current.friends).toEqual([FRIEND]);
    expect(result.current.friendRequests).toEqual([REQUEST]);
  });
});

describe('useFriends — suggestions gate', () => {
  it('does not call getFriendSuggestions when withSuggestions is false', async () => {
    const { result } = renderHook(() =>
      useFriends({ withSuggestions: false }),
    );

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(mockApi.getFriendSuggestions).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
  });
});

describe('useFriends — decoupled loading', () => {
  it('stops loading once friends and requests resolve, even while suggestions hang', async () => {
    mockApi.getFriendSuggestions.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useFriends());

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(result.current.isLoadingSuggestions).toBe(true);
    expect(result.current.friends).toEqual([FRIEND, FRIEND_2]);
    expect(result.current.friendRequests).toEqual([REQUEST]);
    expect(result.current.suggestions).toEqual([]);
  });

  it('clears isLoadingSuggestions once suggestions resolve', async () => {
    const { result } = renderHook(() => useFriends());

    await waitFor(() => expect(result.current.isLoadingSuggestions).toBe(false));

    expect(result.current.suggestions).toEqual([SUGGESTION]);
  });

  it('reports isLoadingSuggestions false when suggestions are disabled', async () => {
    const { result } = renderHook(() =>
      useFriends({ withSuggestions: false }),
    );

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(result.current.isLoadingSuggestions).toBe(false);
  });
});

describe('useFriends — error decoupling', () => {
  it('keeps friends when the requests fetch fails (non-fatal)', async () => {
    mockApi.getFriendRequests.mockRejectedValue(new Error('requests boom'));

    const { result } = renderHook(() => useFriends());

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(result.current.friends).toEqual([FRIEND, FRIEND_2]);
    expect(result.current.friendRequestsError).toBeInstanceOf(Error);
    expect(result.current.friendsError).toBeNull();
  });

  it('reports a fatal error when the friends list fetch fails', async () => {
    mockApi.getFriends.mockRejectedValue(new Error('friends boom'));

    const { result } = renderHook(() => useFriends());

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(result.current.friendsError).toBeInstanceOf(Error);
  });
});

describe('useFriends — search filter', () => {
  it('filters the friends list by name', async () => {
    const { result } = renderHook(() => useFriends({ searchQuery: 'riley' }));

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(result.current.friends).toEqual([FRIEND_2]);
  });

  it('filters the friends list by city (location_name)', async () => {
    const { result } = renderHook(() =>
      useFriends({ searchQuery: 'los angeles' }),
    );

    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    expect(result.current.friends).toEqual([FRIEND_2]);
  });
});

describe('useFriends — refresh & retry', () => {
  it('refetches friends, requests and suggestions on refresh', async () => {
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    await act(async () => {
      result.current.onRefreshFriends();
    });

    // Once on mount + once on refresh for each of the three fetches.
    expect(mockApi.getFriends).toHaveBeenCalledTimes(2);
    expect(mockApi.getFriendRequests).toHaveBeenCalledTimes(2);
    expect(mockApi.getFriendSuggestions).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(result.current.isRefreshingFriends).toBe(false),
    );
  });

  it('refetches all three sources on retry', async () => {
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    await act(async () => {
      result.current.onRetryFriends();
    });

    expect(mockApi.getFriends).toHaveBeenCalledTimes(2);
    expect(mockApi.getFriendRequests).toHaveBeenCalledTimes(2);
    expect(mockApi.getFriendSuggestions).toHaveBeenCalledTimes(2);
  });
});

describe('useFriends — optimistic accept / decline', () => {
  it('removes a request optimistically on accept', async () => {
    mockApi.acceptFriendRequest.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.friendRequests).toHaveLength(1));

    act(() => {
      result.current.onAcceptRequest(REQUEST.id);
    });

    await waitFor(() => {
      expect(result.current.friendRequests).toHaveLength(0);
      expect(mockApi.acceptFriendRequest).toHaveBeenCalledWith(REQUEST.id);
    });
  });

  it('rolls back the request on accept failure', async () => {
    mockApi.acceptFriendRequest.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.friendRequests).toHaveLength(1));

    await act(async () => {
      result.current.onAcceptRequest(REQUEST.id);
    });

    await waitFor(() => expect(result.current.friendRequests).toHaveLength(1));
  });

  it('rolls back the request on decline failure', async () => {
    mockApi.declineFriendRequest.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.friendRequests).toHaveLength(1));

    await act(async () => {
      result.current.onDeclineRequest(REQUEST.id);
    });

    await waitFor(() =>
      expect(result.current.friendRequests).toHaveLength(1),
    );
  });
});

describe('useFriends — optimistic add suggestion', () => {
  it('marks a suggestion as pending optimistically', async () => {
    mockApi.sendFriendRequest.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    act(() => {
      result.current.onAddSuggestion(SUGGESTION.player_id);
    });

    await waitFor(() => {
      expect(result.current.pendingAddIds.has(SUGGESTION.player_id)).toBe(true);
      expect(mockApi.sendFriendRequest).toHaveBeenCalledWith(SUGGESTION.player_id);
    });
  });

  it('rolls back pending state when the send fails', async () => {
    mockApi.sendFriendRequest.mockRejectedValue(new Error('send boom'));
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.isLoadingFriends).toBe(false));

    await act(async () => {
      result.current.onAddSuggestion(SUGGESTION.player_id);
    });

    await waitFor(() =>
      expect(result.current.pendingAddIds.has(SUGGESTION.player_id)).toBe(false),
    );
  });
});
