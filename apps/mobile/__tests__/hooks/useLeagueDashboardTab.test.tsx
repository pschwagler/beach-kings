/**
 * Tests for useLeagueDashboardTab — season-picker state and standings query.
 *
 * Covers:
 *   - Zero seasons: auto-initialises to 'all'; standings query fires with no season_id
 *   - Non-empty seasons: prefers the canonical active season, then the first row
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetLeagueSeasons = jest.fn();
const mockGetLeagueStandings = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    getLeagueStandings: (...args: unknown[]) => mockGetLeagueStandings(...args),
  },
}));

// useRefreshOnFocus calls useFocusEffect (expo-router). Mock it to run the
// callback via useEffect (like the real hook runs it on focus/mount), so
// refetch-on-focus is exercised without a navigation context.
// Capture the latest focus callback so tests can simulate a re-focus.
const focusCallbacks: Array<() => void | (() => void)> = [];
jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)): void => {
      focusCallbacks.push(cb);
      ReactModule.useEffect(() => cb(), [cb]);
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import { useLeagueDashboardTab } from '@/components/screens/Leagues/useLeagueDashboardTab';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const MOCK_STANDINGS_RESPONSE = {
  standings: [
    {
      rank: 1,
      player_id: 10,
      display_name: 'P. Schwagler',
      initials: 'PS',
      avatar_url: null,
      wins: 8,
      losses: 2,
      win_rate: 80,
      rating: 1520,
      rating_delta: 12,
      games_played: 10,
    },
  ],
  season_info: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  focusCallbacks.length = 0;
});

// ---------------------------------------------------------------------------
// Zero-season league
// ---------------------------------------------------------------------------

describe('useLeagueDashboardTab — zero seasons', () => {
  it('reports isLoading=true while selectedSeasonId is still null (no false empty-state frame)', () => {
    // Seasons query never resolves during this synchronous check so selectedSeasonId
    // stays null — the hook must report isLoading=true rather than showing empty standings.
    mockGetLeagueSeasons.mockReturnValue(new Promise(() => {})); // never resolves
    mockGetLeagueStandings.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    // Immediately after first render selectedSeasonId is null (uninitialised).
    // isLoading must be true and isError must be false — no false empty-state flash.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('sets selectedSeasonId to "all" when seasons resolve as empty array', async () => {
    mockGetLeagueSeasons.mockResolvedValue([]);
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    const { result } = renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    // Initially null (uninitialised)
    expect(result.current.selectedSeasonId).toBeNull();

    // After seasons resolve, selectedSeasonId must become 'all'
    await waitFor(() => expect(result.current.selectedSeasonId).toBe('all'));
  });

  it('fires standings query with no season_id (undefined) for zero-season league', async () => {
    mockGetLeagueSeasons.mockResolvedValue([]);
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    // getLeagueStandings must be called with leagueId=1 and seasonId=undefined
    await waitFor(() => {
      expect(mockGetLeagueStandings).toHaveBeenCalledWith(1, undefined);
    });
    // Exactly one fetch — the all-time query must not double-fire on auto-init.
    expect(mockGetLeagueStandings).toHaveBeenCalledTimes(1);
  });

  it('refetches standings when the league screen regains focus (bypasses staleTime)', async () => {
    // makeClient uses staleTime: Infinity, so a cache hit would NEVER refetch on
    // its own. This is the post-submit scenario: the standings tab stayed mounted
    // while the session was submitted on a pushed screen, so only a focus event
    // (not a remount) can refresh it. Regression guard for the "No standings yet
    // after submit until relaunch" bug.
    mockGetLeagueSeasons.mockResolvedValue([]);
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(mockGetLeagueStandings).toHaveBeenCalledTimes(1));
    const callsBeforeFocus = mockGetLeagueStandings.mock.calls.length;

    // Simulate the screen regaining focus (returning after submit).
    await act(async () => {
      focusCallbacks[focusCallbacks.length - 1]?.();
    });

    await waitFor(() =>
      expect(mockGetLeagueStandings.mock.calls.length).toBeGreaterThan(callsBeforeFocus),
    );
  });

  it('exposes standings data for zero-season league', async () => {
    mockGetLeagueSeasons.mockResolvedValue([]);
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    const { result } = renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.standings).toHaveLength(1);
    expect(result.current.isError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-empty seasons (regression guard)
// ---------------------------------------------------------------------------

describe('useLeagueDashboardTab — non-empty seasons', () => {
  const MOCK_SEASONS = [
    { id: 4, name: 'Fall 2025', is_active: false, start_date: '2025-09-01', end_date: '2025-12-31' },
    { id: 3, name: 'Summer 2025', is_active: true, start_date: '2025-06-01', end_date: '2025-10-01' },
    { id: 2, name: 'Spring 2025', is_active: false, start_date: '2025-03-01', end_date: '2025-05-31' },
  ];

  it('defaults to the canonical active season even when it is not first', async () => {
    mockGetLeagueSeasons.mockResolvedValue(MOCK_SEASONS);
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    const { result } = renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.selectedSeasonId).toBe(3));
  });

  it('fires the standings query with the canonical active season id', async () => {
    mockGetLeagueSeasons.mockResolvedValue(MOCK_SEASONS);
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => {
      expect(mockGetLeagueStandings).toHaveBeenCalledWith(1, 3);
    });
  });

  it('falls back to the first season when none is active', async () => {
    mockGetLeagueSeasons.mockResolvedValue(
      MOCK_SEASONS.map((season) => ({ ...season, is_active: false })),
    );
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    const { result } = renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.selectedSeasonId).toBe(4));
  });
});
