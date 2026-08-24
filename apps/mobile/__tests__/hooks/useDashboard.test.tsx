/**
 * Tests for useDashboard — the TanStack Query facade backing the home screen.
 *
 * Mocks `@/lib/api` at the module level. Each test wires a fresh
 * QueryClient to isolate cache state.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

// Hoisted mock of the api module. All functions resolve synchronously.
jest.mock('@/lib/api', () => {
  const api = {
    getCurrentUserPlayer: jest.fn(),
    getUserLeagues: jest.fn(),
    getSessions: jest.fn(),
    getFriendRequests: jest.fn(),
    getCourts: jest.fn(),
    getPlayerMatchHistory: jest.fn(),
    getMyStats: jest.fn(),
    // Used by the centralized location resolver (skipDevice path on home).
    getPlayerHomeCourts: jest.fn(),
    getLocations: jest.fn(),
  };
  return { api };
});

import { api } from '@/lib/api';
import { useDashboard, dashboardKeys } from '@/hooks/useDashboard';
import { courtQueries } from '@/features/courts';

const mockApi = api as unknown as {
  getCurrentUserPlayer: jest.Mock;
  getUserLeagues: jest.Mock;
  getSessions: jest.Mock;
  getFriendRequests: jest.Mock;
  getCourts: jest.Mock;
  getPlayerMatchHistory: jest.Mock;
  getMyStats: jest.Mock;
  getPlayerHomeCourts: jest.Mock;
  getLocations: jest.Mock;
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
}

const PLAYER = { id: 42, location_id: 'socal_sd' };

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockApi.getCurrentUserPlayer.mockReset();
  mockApi.getUserLeagues.mockReset();
  mockApi.getSessions.mockReset();
  mockApi.getFriendRequests.mockReset();
  mockApi.getCourts.mockReset();
  mockApi.getPlayerMatchHistory.mockReset();
  mockApi.getMyStats.mockReset().mockResolvedValue({
    player_name: 'Player', player_city: null, player_level: null,
    overall: { wins: 0, losses: 0, games_played: 0, rating: 1200,
      peak_rating: 1200, win_rate: 0, current_streak: 0, avg_point_diff: 0 },
    trophies: [], partners: [], opponents: [], elo_timeline: [],
  });
  // Resolver fallbacks: default to "nothing found" so coords stay null and the
  // dashboard keeps using the location_id filter (PLAYER has no city coords).
  mockApi.getPlayerHomeCourts.mockReset().mockResolvedValue([]);
  mockApi.getLocations.mockReset().mockResolvedValue([]);
});

describe('dashboardKeys', () => {
  it('produces stable, namespaced keys', () => {
    expect(dashboardKeys.root(7)).toEqual(['private', 7, 'dashboard']);
    // The player is centralized under its own key (see useCurrentPlayer).
    expect(dashboardKeys.player(7)).toEqual(['private', 7, 'player', 'me']);
    expect(dashboardKeys.courts(7, null, null)).toEqual([
      'private',
      7,
      'courts',
      'nearby',
      null,
      null,
      null,
    ]);
    expect(dashboardKeys.courts(7, null, 'socal_sd')).toEqual([
      'private',
      7,
      'courts',
      'nearby',
      null,
      null,
      'socal_sd',
    ]);
    expect(
      dashboardKeys.courts(7, null, 'socal_sd'),
    ).toEqual(courtQueries.nearby(7, null, 'socal_sd').queryKey);
    expect(dashboardKeys.matches(7, 42)).toEqual([
      'private',
      7,
      'matches',
      'history',
      42,
    ]);
    expect(dashboardKeys.matches(7, null)).toEqual([
      'private',
      7,
      'matches',
      'history',
      'none',
    ]);
    expect(dashboardKeys.stats(7)).toEqual([
      'private', 7, 'stats', 'me', { league_id: 'all', days: 'all' },
    ]);
  });
});

describe('useDashboard', () => {
  it.each([
    ['leagues', 'getUserLeagues'],
    ['friendRequests', 'getFriendRequests'],
    ['courts', 'getCourts'],
    ['matches', 'getPlayerMatchHistory'],
    ['stats', 'getMyStats'],
  ] as const)(
    'does not globally gate ready content on never-resolving %s',
    async (section, method) => {
      const pending = deferred<never>();
      mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
      mockApi.getUserLeagues.mockResolvedValue([]);
      mockApi.getSessions.mockResolvedValue([]);
      mockApi.getFriendRequests.mockResolvedValue([]);
      mockApi.getCourts.mockResolvedValue([]);
      mockApi.getPlayerMatchHistory.mockResolvedValue([]);
      mockApi[method].mockReturnValue(pending.promise);

      const { result } = renderHook(() => useDashboard(), {
        wrapper: makeWrapper(makeClient()),
      });

      await waitFor(() => expect(result.current.player.isSuccess).toBe(true));
      expect(result.current[section].isPending).toBe(true);
      expect(result.current.isInitialLoading).toBe(false);
    },
  );

  it('is initial-loading only until the uncached player query settles', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getSessions.mockResolvedValue([]);
    mockApi.getFriendRequests.mockResolvedValue([]);
    mockApi.getCourts.mockResolvedValue([]);
    mockApi.getPlayerMatchHistory.mockResolvedValue([]);

    const client = makeClient();
    const { result } = renderHook(() => useDashboard(), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.isInitialLoading).toBe(true);

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    expect(result.current.player.data).toEqual(PLAYER);
    expect(result.current.leagues.data).toEqual([]);
    expect(result.current.activeSession.data).toBeNull();
    expect(result.current.friendRequests.data).toEqual([]);
    expect(result.current.courts.data).toEqual([]);
    expect(result.current.matches.data).toEqual([]);
    expect(result.current.stats.data?.overall.rating).toBe(1200);
  });

  it('passes the player location_id into getCourts', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getSessions.mockResolvedValue([]);
    mockApi.getFriendRequests.mockResolvedValue([]);
    mockApi.getCourts.mockResolvedValue([]);
    mockApi.getPlayerMatchHistory.mockResolvedValue([]);

    const { result } = renderHook(() => useDashboard(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(mockApi.getCourts).toHaveBeenCalledWith({
      location_id: 'socal_sd',
    });
  });

  it('requests incoming friend requests (backend direction vocabulary)', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getSessions.mockResolvedValue([]);
    mockApi.getFriendRequests.mockResolvedValue([]);
    mockApi.getCourts.mockResolvedValue([]);
    mockApi.getPlayerMatchHistory.mockResolvedValue([]);

    const { result } = renderHook(() => useDashboard(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    // Backend only accepts incoming/outgoing/both; received/sent -> 422.
    expect(mockApi.getFriendRequests).toHaveBeenCalledWith('incoming');
  });

  it('passes the player id into getPlayerMatchHistory', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getSessions.mockResolvedValue([]);
    mockApi.getFriendRequests.mockResolvedValue([]);
    mockApi.getCourts.mockResolvedValue([]);
    mockApi.getPlayerMatchHistory.mockResolvedValue([]);

    const { result } = renderHook(() => useDashboard(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(mockApi.getPlayerMatchHistory).toHaveBeenCalledWith(42);
  });

  it('skips matches when the player fetch returns null', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(null);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getSessions.mockResolvedValue([]);
    mockApi.getFriendRequests.mockResolvedValue([]);
    mockApi.getCourts.mockResolvedValue([]);

    const { result } = renderHook(() => useDashboard(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() =>
      expect(result.current.player.isSuccess).toBe(true),
    );
    // Matches is gated on a non-null player id and should not fire.
    expect(mockApi.getPlayerMatchHistory).not.toHaveBeenCalled();
    expect(result.current.matches.fetchStatus).toBe('idle');
    expect(result.current.isInitialLoading).toBe(false);
    // Courts still fires with a null location id (not player-id gated).
    await waitFor(() => expect(mockApi.getCourts).toHaveBeenCalled());
    expect(mockApi.getCourts).toHaveBeenCalledWith({ location_id: null });
  });

  it('keeps player-dependent queries idle after an uncached player failure', async () => {
    mockApi.getCurrentUserPlayer.mockRejectedValue(new Error('player unavailable'));
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getSessions.mockResolvedValue([]);
    mockApi.getFriendRequests.mockResolvedValue([]);

    const { result } = renderHook(() => useDashboard(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.player.isError).toBe(true));
    expect(result.current.player.data).toBeUndefined();
    expect(result.current.matches.fetchStatus).toBe('idle');
    expect(result.current.courts.fetchStatus).toBe('idle');
    expect(result.current.isInitialLoading).toBe(false);
  });

  it('surfaces query errors on each section independently', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockRejectedValue(new Error('leagues down'));
    mockApi.getSessions.mockResolvedValue([]);
    mockApi.getFriendRequests.mockResolvedValue([]);
    mockApi.getCourts.mockResolvedValue([]);
    mockApi.getPlayerMatchHistory.mockResolvedValue([]);

    const { result } = renderHook(() => useDashboard(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.leagues.isError).toBe(true));
    expect(result.current.leagues.error).toEqual(new Error('leagues down'));
    expect(result.current.player.isSuccess).toBe(true);
  });

  it('refetchAll invalidates every dashboard query', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getSessions.mockResolvedValue([]);
    mockApi.getFriendRequests.mockResolvedValue([]);
    mockApi.getCourts.mockResolvedValue([]);
    mockApi.getPlayerMatchHistory.mockResolvedValue([]);

    const { result } = renderHook(() => useDashboard(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    const callsBefore = mockApi.getCurrentUserPlayer.mock.calls.length;
    await act(async () => {
      await result.current.refetchAll();
    });

    expect(
      mockApi.getCurrentUserPlayer.mock.calls.length,
    ).toBeGreaterThan(callsBefore);
  });
});
