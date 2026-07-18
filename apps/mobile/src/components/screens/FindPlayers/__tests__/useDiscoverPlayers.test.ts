/**
 * Tests for the useDiscoverPlayers hook.
 *
 * Focus: the discover response normalization (paginated `{ items }` envelope,
 * bare array, and the backend `id`/`location_name`/`total_games` field
 * spellings), the client-side search filter, and optimistic add-friend with
 * rollback on failure.
 */

import React from 'react';
import {
  renderHook as renderQueryHook,
  waitFor,
  act,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — factories run before the subject under test is imported.
// ---------------------------------------------------------------------------

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 123 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    discoverPlayers: jest.fn(),
    sendFriendRequest: jest.fn(),
  },
}));

import { useDiscoverPlayers } from '../useDiscoverPlayers';
import { api } from '@/lib/api';

const mockApi = api as unknown as {
  discoverPlayers: jest.Mock;
  sendFriendRequest: jest.Mock;
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

const PLAYER = {
  player_id: 7,
  full_name: 'Bob Jones',
  avatar: null,
  city: 'San Diego',
  level: 'advanced',
  games_played: 12,
  mutual_friends_count: 1,
  last_active_label: null,
  friend_status: 'none' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.sendFriendRequest.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Server-side filters (chips)
// ---------------------------------------------------------------------------

describe('useDiscoverPlayers — filters', () => {
  beforeEach(() => {
    mockApi.discoverPlayers.mockResolvedValue({ items: [PLAYER] });
  });

  it('fetches with no params by default', async () => {
    const { result } = renderHook(() => useDiscoverPlayers());
    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(mockApi.discoverPlayers).toHaveBeenCalledWith({});
    expect(result.current.levelFilter).toBeNull();
    expect(result.current.sameLeagueOnly).toBe(false);
    expect(result.current.sharedFriendsOnly).toBe(false);
  });

  it('refetches with the level param when a level chip is toggled on', async () => {
    const { result } = renderHook(() => useDiscoverPlayers());
    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    act(() => {
      result.current.onToggleLevel('AA');
    });

    await waitFor(() =>
      expect(mockApi.discoverPlayers).toHaveBeenLastCalledWith({ level: 'AA' }),
    );
    expect(result.current.levelFilter).toBe('AA');
  });

  it('selecting another level replaces the filter; re-tapping clears it', async () => {
    const { result } = renderHook(() => useDiscoverPlayers());
    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    act(() => {
      result.current.onToggleLevel('AA');
    });
    act(() => {
      result.current.onToggleLevel('Open');
    });
    await waitFor(() =>
      expect(mockApi.discoverPlayers).toHaveBeenLastCalledWith({
        level: 'Open',
      }),
    );

    act(() => {
      result.current.onToggleLevel('Open');
    });
    await waitFor(() =>
      expect(mockApi.discoverPlayers).toHaveBeenLastCalledWith({}),
    );
    expect(result.current.levelFilter).toBeNull();
  });

  it('passes same_league and has_mutuals when those chips are on', async () => {
    const { result } = renderHook(() => useDiscoverPlayers());
    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    act(() => {
      result.current.onToggleSameLeague();
    });
    await waitFor(() =>
      expect(mockApi.discoverPlayers).toHaveBeenLastCalledWith({
        same_league: true,
      }),
    );

    act(() => {
      result.current.onToggleSharedFriends();
    });
    await waitFor(() =>
      expect(mockApi.discoverPlayers).toHaveBeenLastCalledWith({
        same_league: true,
        has_mutuals: true,
      }),
    );
    expect(result.current.sameLeagueOnly).toBe(true);
    expect(result.current.sharedFriendsOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------

describe('useDiscoverPlayers — normalization', () => {
  it('normalizes a paginated discover response into a players array', async () => {
    mockApi.discoverPlayers.mockResolvedValue({
      items: [PLAYER],
      total_count: 1,
      page: 1,
      page_size: 25,
    });

    const { result } = renderHook(() => useDiscoverPlayers());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.playersError).toBeNull();
    expect(result.current.players).toEqual([PLAYER]);
  });

  it('still supports a bare-array discover response', async () => {
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);

    const { result } = renderHook(() => useDiscoverPlayers());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([PLAYER]);
  });

  it('falls back to an empty array when items is absent', async () => {
    mockApi.discoverPlayers.mockResolvedValue({ total_count: 0 });

    const { result } = renderHook(() => useDiscoverPlayers());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([]);
  });

  it('maps the backend discover item shape onto DiscoverPlayer', async () => {
    // Backend serializes id/location_name/total_games/mutual_friend_count.
    mockApi.discoverPlayers.mockResolvedValue({
      items: [
        {
          id: 2,
          full_name: 'Colan Gulla',
          avatar: 'CG',
          location_name: 'NY - New York City Metro',
          level: 'Open',
          total_games: 102,
          mutual_friend_count: 3,
          friend_status: 'none',
        },
      ],
    });

    const { result } = renderHook(() => useDiscoverPlayers());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([
      {
        player_id: 2,
        full_name: 'Colan Gulla',
        avatar: 'CG',
        city: 'NY - New York City Metro',
        level: 'Open',
        games_played: 102,
        mutual_friends_count: 3,
        last_active_label: null,
        friend_status: 'none',
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Search filter
// ---------------------------------------------------------------------------

describe('useDiscoverPlayers — search filter', () => {
  const NY = {
    ...PLAYER,
    player_id: 8,
    full_name: 'Nina York',
    city: 'New York',
  };

  it('filters the discover list by name', async () => {
    mockApi.discoverPlayers.mockResolvedValue({ items: [PLAYER, NY] });

    const { result } = renderHook(() =>
      useDiscoverPlayers({ searchQuery: 'bob' }),
    );

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([PLAYER]);
  });

  it('filters the discover list by city', async () => {
    mockApi.discoverPlayers.mockResolvedValue({ items: [PLAYER, NY] });

    const { result } = renderHook(() =>
      useDiscoverPlayers({ searchQuery: 'new york' }),
    );

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([NY]);
  });
});

// ---------------------------------------------------------------------------
// Refresh & retry
// ---------------------------------------------------------------------------

describe('useDiscoverPlayers — refresh & retry', () => {
  it('refetches the discover list on refresh and clears the refreshing flag', async () => {
    mockApi.discoverPlayers.mockResolvedValue({ items: [PLAYER] });

    const { result } = renderHook(() => useDiscoverPlayers());
    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    await act(async () => {
      result.current.onRefreshPlayers();
    });

    // Once on mount + once on refresh.
    expect(mockApi.discoverPlayers).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(result.current.isRefreshingPlayers).toBe(false),
    );
  });

  it('refetches the discover list on retry', async () => {
    mockApi.discoverPlayers.mockResolvedValue({ items: [PLAYER] });

    const { result } = renderHook(() => useDiscoverPlayers());
    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    await act(async () => {
      result.current.onRetryPlayers();
    });

    expect(mockApi.discoverPlayers).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Optimistic add friend
// ---------------------------------------------------------------------------

describe('useDiscoverPlayers — add friend', () => {
  it('optimistically marks a player as pending on add', async () => {
    mockApi.discoverPlayers.mockResolvedValue({ items: [PLAYER] });
    mockApi.sendFriendRequest.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDiscoverPlayers());
    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    act(() => {
      result.current.onAddFriend(7);
    });

    await waitFor(() => {
      expect(result.current.pendingSendIds.has(7)).toBe(true);
      expect(mockApi.sendFriendRequest).toHaveBeenCalledWith(7);
    });
  });

  it('rolls back the pending state when the request fails', async () => {
    mockApi.discoverPlayers.mockResolvedValue({ items: [PLAYER] });
    mockApi.sendFriendRequest.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useDiscoverPlayers());
    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    act(() => {
      result.current.onAddFriend(7);
    });

    await waitFor(() =>
      expect(result.current.pendingSendIds.has(7)).toBe(false),
    );
  });
});
