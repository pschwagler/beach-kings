/**
 * Tests for useLeagueStatsTab — zero-season all-time stats and season selection.
 *
 * Covers:
 *   - Zero seasons: stats query fires with null season_id (all-time); no false error
 *   - Zero seasons: exposed selectedSeasonId is null (public interface stable)
 *   - Non-empty seasons: first season selected as before (regression guard)
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetLeagueSeasons = jest.fn();
const mockGetLeaguePlayerStats = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    getLeaguePlayerStats: (...args: unknown[]) => mockGetLeaguePlayerStats(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import { useLeagueStatsTab } from '@/components/screens/Leagues/useLeagueStatsTab';

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

const MOCK_STATS = {
  player_id: 10,
  display_name: 'P. Schwagler',
  initials: 'PS',
  level: 'Open',
  league_name: 'Beach Kings',
  season_name: null,
  rank: null,
  rating: 1520,
  rating_delta: null,
  overall: {
    wins: 8,
    losses: 2,
    win_rate: 0.8,
    games_played: 10,
    point_diff: 12.5,
  },
  partners: [],
  opponents: [],
  game_history: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Zero-season league
// ---------------------------------------------------------------------------

describe('useLeagueStatsTab — zero seasons', () => {
  it('reports isLoading=true while selectedSeasonId is still null (no false error frame)', () => {
    // Seasons query never resolves during this synchronous check so selectedSeasonId
    // stays null — the hook must report isLoading=true instead of surfacing an error.
    mockGetLeagueSeasons.mockReturnValue(new Promise(() => {})); // never resolves
    mockGetLeaguePlayerStats.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLeagueStatsTab(1, 10), {
      wrapper: makeWrapper(makeClient()),
    });

    // Immediately after first render selectedSeasonId is null (uninitialised).
    // isLoading must be true and isError must be false — no false error flash.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('surfaces isError (not infinite loading) when the seasons query fails', async () => {
    // A failed seasons fetch leaves selectedSeasonId null forever (auto-init only
    // runs on resolved data). The hook must report the error, not spin endlessly.
    mockGetLeagueSeasons.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useLeagueStatsTab(1, 10), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });

  it('fires stats query with null season_id (all-time) for zero-season league', async () => {
    mockGetLeagueSeasons.mockResolvedValue([]);
    mockGetLeaguePlayerStats.mockResolvedValue(MOCK_STATS);

    renderHook(() => useLeagueStatsTab(1, 10), {
      wrapper: makeWrapper(makeClient()),
    });

    // getLeaguePlayerStats called with leagueId=1, playerId=10, seasonId=null
    await waitFor(() => {
      expect(mockGetLeaguePlayerStats).toHaveBeenCalledWith(1, 10, null);
    });
    // Exactly one fetch — the all-time query must not double-fire on auto-init.
    expect(mockGetLeaguePlayerStats).toHaveBeenCalledTimes(1);
  });

  it('returns stats data and isError=false for zero-season league', async () => {
    mockGetLeagueSeasons.mockResolvedValue([]);
    mockGetLeaguePlayerStats.mockResolvedValue(MOCK_STATS);

    const { result } = renderHook(() => useLeagueStatsTab(1, 10), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.stats).toEqual(MOCK_STATS);
    expect(result.current.isError).toBe(false);
  });

  it('exposes selectedSeasonId as null (public interface) for zero-season league', async () => {
    mockGetLeagueSeasons.mockResolvedValue([]);
    mockGetLeaguePlayerStats.mockResolvedValue(MOCK_STATS);

    const { result } = renderHook(() => useLeagueStatsTab(1, 10), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Public interface maps 'all' → null so callers remain unaffected
    expect(result.current.selectedSeasonId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Non-empty seasons (regression guard)
// ---------------------------------------------------------------------------

describe('useLeagueStatsTab — non-empty seasons', () => {
  const MOCK_SEASONS = [
    { id: 3, name: 'Summer 2025', is_active: true, start_date: '2025-06-01', end_date: null },
    { id: 2, name: 'Spring 2025', is_active: false, start_date: '2025-03-01', end_date: '2025-05-31' },
  ];

  it('defaults to first season and calls stats with that season id', async () => {
    mockGetLeagueSeasons.mockResolvedValue(MOCK_SEASONS);
    mockGetLeaguePlayerStats.mockResolvedValue({ ...MOCK_STATS, season_name: 'Summer 2025' });

    const { result } = renderHook(() => useLeagueStatsTab(1, 10), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => {
      expect(mockGetLeaguePlayerStats).toHaveBeenCalledWith(1, 10, 3);
    });

    expect(result.current.selectedSeasonId).toBe(3);
  });
});
