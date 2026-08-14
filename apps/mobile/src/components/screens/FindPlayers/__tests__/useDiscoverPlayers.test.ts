/**
 * Tests for the useDiscoverPlayers hook.
 *
 * Focus: the canonical API-client contract, debounced server-side search, and
 * optimistic add-friend with rollback on failure.
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

function renderHook<Result, Props>(
  callback: (props: Props) => Result,
  options?: { initialProps?: Props },
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  function Wrapper({ children }: { readonly children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return renderQueryHook(callback, { wrapper: Wrapper, ...options });
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
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);
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
    await waitFor(() => expect(result.current.levelFilter).toBeNull());
    // The original unfiltered query is still fresh, so Query reuses it rather
    // than issuing a redundant request when the chip is cleared.
    expect(mockApi.discoverPlayers).toHaveBeenCalledTimes(3);
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
// Canonical API-client response
// ---------------------------------------------------------------------------

describe('useDiscoverPlayers — API contract', () => {
  it('consumes a canonical players array', async () => {
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);

    const { result } = renderHook(() => useDiscoverPlayers());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.playersError).toBeNull();
    expect(result.current.players).toEqual([PLAYER]);
  });

  it('supports an empty canonical response', async () => {
    mockApi.discoverPlayers.mockResolvedValue([]);

    const { result } = renderHook(() => useDiscoverPlayers());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([]);
  });

  it('passes through canonical discovery fields', async () => {
    const canonicalPlayer = {
      player_id: 2,
      full_name: 'Colan Gulla',
      avatar: 'CG',
      city: 'NY - New York City Metro',
      level: 'Open',
      games_played: 102,
      mutual_friends_count: 3,
      last_active_label: null,
      friend_status: 'none',
    };
    mockApi.discoverPlayers.mockResolvedValue([canonicalPlayer]);

    const { result } = renderHook(() => useDiscoverPlayers());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([canonicalPlayer]);
  });
});

// ---------------------------------------------------------------------------
// Server-side search
// ---------------------------------------------------------------------------

describe('useDiscoverPlayers — search', () => {
  it('sends the searchQuery to the server as the search param', async () => {
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);

    const { result } = renderHook(() =>
      useDiscoverPlayers({ searchQuery: 'bob' }),
    );

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(mockApi.discoverPlayers).toHaveBeenCalledWith({ search: 'bob' });
    // Results are used as-is; the server applies the name filter.
    expect(result.current.players).toEqual([PLAYER]);
  });

  it('debounces search-box changes before refetching', async () => {
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);

    const { rerender } = renderHook(
      ({ q }: { readonly q: string }) => useDiscoverPlayers({ searchQuery: q }),
      { initialProps: { q: '' } },
    );
    await waitFor(() =>
      expect(mockApi.discoverPlayers).toHaveBeenCalledWith({}),
    );

    rerender({ q: 'nina' });
    // Still inside the debounce window, so no new request has fired.
    expect(mockApi.discoverPlayers).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(mockApi.discoverPlayers).toHaveBeenLastCalledWith({
        search: 'nina',
      }),
    );
  });

  it('trims and ignores blank search input', async () => {
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);

    const { result } = renderHook(() =>
      useDiscoverPlayers({ searchQuery: '   ' }),
    );

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(mockApi.discoverPlayers).toHaveBeenCalledWith({});
  });
});

// ---------------------------------------------------------------------------
// Refresh & retry
// ---------------------------------------------------------------------------

describe('useDiscoverPlayers — refresh & retry', () => {
  it('refetches the discover list on refresh and clears the refreshing flag', async () => {
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);

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
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);

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
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);
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
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);
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
