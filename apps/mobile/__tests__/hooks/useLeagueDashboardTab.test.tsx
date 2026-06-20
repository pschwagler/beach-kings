/**
 * Tests for useLeagueDashboardTab — season-picker state and standings query.
 *
 * Covers:
 *   - Zero seasons: auto-initialises to 'all'; standings query fires with no season_id
 *   - Non-empty seasons: auto-initialises to first season id (regression guard)
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetLeagueSeasons = jest.fn();
const mockGetLeagueStandings = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    getLeagueStandings: (...args: unknown[]) => mockGetLeagueStandings(...args),
  },
}));

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
});

// ---------------------------------------------------------------------------
// Zero-season league
// ---------------------------------------------------------------------------

describe('useLeagueDashboardTab — zero seasons', () => {
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
    { id: 3, name: 'Summer 2025', is_active: true, start_date: '2025-06-01', end_date: null },
    { id: 2, name: 'Spring 2025', is_active: false, start_date: '2025-03-01', end_date: '2025-05-31' },
  ];

  it('defaults to first season id when seasons are present', async () => {
    mockGetLeagueSeasons.mockResolvedValue(MOCK_SEASONS);
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    const { result } = renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.selectedSeasonId).toBe(3));
  });

  it('fires standings query with first season id', async () => {
    mockGetLeagueSeasons.mockResolvedValue(MOCK_SEASONS);
    mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);

    renderHook(() => useLeagueDashboardTab(1), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => {
      expect(mockGetLeagueStandings).toHaveBeenCalledWith(1, 3);
    });
  });
});
