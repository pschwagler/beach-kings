/**
 * Tests for useDashboard — the TanStack Query facade backing the home screen.
 *
 * Mocks `@/lib/api` at the module level. Each test wires a fresh
 * QueryClient to isolate cache state.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Hoisted mock of the api module. All six functions resolve synchronously.
jest.mock('@/lib/api', () => {
  const api = {
    getCurrentUserPlayer: jest.fn(),
    getUserLeagues: jest.fn(),
    getActiveSession: jest.fn(),
    getFriendRequests: jest.fn(),
    getCourts: jest.fn(),
    getPlayerMatchHistory: jest.fn(),
  };
  return { api };
});

import { api } from '@/lib/api';
import { useDashboard, dashboardKeys } from '@/hooks/useDashboard';

const mockApi = api as unknown as {
  getCurrentUserPlayer: jest.Mock;
  getUserLeagues: jest.Mock;
  getActiveSession: jest.Mock;
  getFriendRequests: jest.Mock;
  getCourts: jest.Mock;
  getPlayerMatchHistory: jest.Mock;
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

beforeEach(() => {
  mockApi.getCurrentUserPlayer.mockReset();
  mockApi.getUserLeagues.mockReset();
  mockApi.getActiveSession.mockReset();
  mockApi.getFriendRequests.mockReset();
  mockApi.getCourts.mockReset();
  mockApi.getPlayerMatchHistory.mockReset();
});

describe('dashboardKeys', () => {
  it('produces stable, namespaced keys', () => {
    expect(dashboardKeys.root).toEqual(['dashboard']);
    expect(dashboardKeys.player()).toEqual(['dashboard', 'player']);
    expect(dashboardKeys.courts(null)).toEqual(['dashboard', 'courts', 'null']);
    expect(dashboardKeys.courts('socal_sd')).toEqual([
      'dashboard',
      'courts',
      'socal_sd',
    ]);
    expect(dashboardKeys.matches(7)).toEqual(['dashboard', 'matches', 7]);
    expect(dashboardKeys.matches(null)).toEqual(['dashboard', 'matches', 'none']);
  });
});

describe('useDashboard', () => {
  it('is initial-loading until all primary queries settle', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getActiveSession.mockResolvedValue(null);
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
  });

  it('passes the player location_id into getCourts', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getActiveSession.mockResolvedValue(null);
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

  it('passes the player id into getPlayerMatchHistory', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockResolvedValue([]);
    mockApi.getActiveSession.mockResolvedValue(null);
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
    mockApi.getActiveSession.mockResolvedValue(null);
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
    // Courts still fires with a null location id (not player-id gated).
    await waitFor(() => expect(mockApi.getCourts).toHaveBeenCalled());
    expect(mockApi.getCourts).toHaveBeenCalledWith({ location_id: null });
  });

  it('surfaces query errors on each section independently', async () => {
    mockApi.getCurrentUserPlayer.mockResolvedValue(PLAYER);
    mockApi.getUserLeagues.mockRejectedValue(new Error('leagues down'));
    mockApi.getActiveSession.mockResolvedValue(null);
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
    mockApi.getActiveSession.mockResolvedValue(null);
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
