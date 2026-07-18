/**
 * Tests for LeagueStatsTab — GameHistoryCard self-slot label.
 *
 * Covers:
 *   - When is_self=true, game rows label the viewed player's team slot "You"
 *   - When is_self=false, game rows label the team slot with the player's first name
 *   - Partner names are appended after the self-label when present
 *   - Fallback: single-token display_name used as-is
 *   - Fallback: empty display_name falls back to "Player"
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetLeagueSeasons = jest.fn();
const mockGetLeaguePlayerStats = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    getLeaguePlayerStats: (...args: unknown[]) => mockGetLeaguePlayerStats(...args),
  },
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import LeagueStatsTab from '@/components/screens/Leagues/LeagueStatsTab';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const BASE_OVERALL = {
  wins: 5,
  losses: 2,
  win_rate: 0.714,
  games_played: 7,
  point_diff: 8.5,
};

function makeStats(overrides: Record<string, unknown>) {
  return {
    player_id: 42,
    display_name: 'Alex Torres',
    initials: 'AT',
    level: 'AA',
    location_name: null,
    league_id: 1,
    league_name: 'Beach Kings',
    season_id: null,
    season_name: null,
    rank: 3,
    rating: 1500,
    rating_delta: null,
    points: null,
    overall: BASE_OVERALL,
    partners: [],
    opponents: [],
    game_history: [],
    is_self: false,
    ...overrides,
  };
}

const GAME_WITH_PARTNER = {
  id: 101,
  result: 'W' as const,
  my_score: 21,
  opponent_score: 15,
  partner_names: ['Jordan Lee'],
  partner_ids: [99],
  opponent_names: ['Sam Rivera', 'Casey Kim'],
  opponent_ids: [55, 56],
  session_date: '2025-06-01',
  session_id: 200,
  rating_change: 10,
  session_submitted: true,
};

const GAME_NO_PARTNER = {
  id: 102,
  result: 'L' as const,
  my_score: 18,
  opponent_score: 21,
  partner_names: [] as string[],
  partner_ids: [] as number[],
  opponent_names: ['Dana Weiss'],
  opponent_ids: [77],
  session_date: '2025-06-02',
  session_id: 201,
  rating_change: -5,
  session_submitted: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLeagueSeasons.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// GameHistoryCard — self-slot label
// ---------------------------------------------------------------------------

describe('LeagueStatsTab — GameHistoryCard self-slot label', () => {
  it('shows "You / {partner}" when is_self=true and there is a partner', async () => {
    mockGetLeaguePlayerStats.mockResolvedValue(
      makeStats({ is_self: true, game_history: [GAME_WITH_PARTNER] }),
    );

    render(<LeagueStatsTab leagueId={1} playerId={42} />, {
      wrapper: makeWrapper(),
    });

    // Switch to Game History tab
    await waitFor(() => {
      expect(screen.getByTestId('stats-inner-tab-history')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('stats-inner-tab-history'));

    await waitFor(() => {
      expect(screen.getByTestId(`stats-game-${GAME_WITH_PARTNER.id}`)).toBeTruthy();
    });

    // The team text should say "You / Jordan Lee vs ..."
    expect(screen.getByText(/^You \/ Jordan Lee vs/)).toBeTruthy();
    expect(screen.getByText('21-15')).toBeTruthy();
  });

  it('shows "You" (solo) when is_self=true and there are no partners', async () => {
    mockGetLeaguePlayerStats.mockResolvedValue(
      makeStats({ is_self: true, game_history: [GAME_NO_PARTNER] }),
    );

    render(<LeagueStatsTab leagueId={1} playerId={42} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats-inner-tab-history')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('stats-inner-tab-history'));

    await waitFor(() => {
      expect(screen.getByTestId(`stats-game-${GAME_NO_PARTNER.id}`)).toBeTruthy();
    });

    expect(screen.getByText(/^You vs/)).toBeTruthy();
  });

  it('shows "{firstName} / {partner}" when is_self=false and there is a partner', async () => {
    mockGetLeaguePlayerStats.mockResolvedValue(
      makeStats({
        is_self: false,
        display_name: 'Alex Torres',
        game_history: [GAME_WITH_PARTNER],
      }),
    );

    render(<LeagueStatsTab leagueId={1} playerId={42} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats-inner-tab-history')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('stats-inner-tab-history'));

    await waitFor(() => {
      expect(screen.getByTestId(`stats-game-${GAME_WITH_PARTNER.id}`)).toBeTruthy();
    });

    // Must NOT say "You" — must say "Alex / Jordan Lee vs ..."
    expect(screen.queryByText(/^You/)).toBeNull();
    expect(screen.getByText(/^Alex \/ Jordan Lee vs/)).toBeTruthy();
  });

  it('shows "{firstName}" (solo) when is_self=false and there are no partners', async () => {
    mockGetLeaguePlayerStats.mockResolvedValue(
      makeStats({
        is_self: false,
        display_name: 'Alex Torres',
        game_history: [GAME_NO_PARTNER],
      }),
    );

    render(<LeagueStatsTab leagueId={1} playerId={42} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats-inner-tab-history')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('stats-inner-tab-history'));

    await waitFor(() => {
      expect(screen.getByTestId(`stats-game-${GAME_NO_PARTNER.id}`)).toBeTruthy();
    });

    expect(screen.queryByText(/^You/)).toBeNull();
    expect(screen.getByText(/^Alex vs/)).toBeTruthy();
  });

  it('uses full display_name as label when is_self=false and display_name is a single token', async () => {
    mockGetLeaguePlayerStats.mockResolvedValue(
      makeStats({
        is_self: false,
        display_name: 'Mika',
        game_history: [GAME_NO_PARTNER],
      }),
    );

    render(<LeagueStatsTab leagueId={1} playerId={42} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats-inner-tab-history')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('stats-inner-tab-history'));

    await waitFor(() => {
      expect(screen.getByTestId(`stats-game-${GAME_NO_PARTNER.id}`)).toBeTruthy();
    });

    expect(screen.getByText(/^Mika vs/)).toBeTruthy();
  });

  it('falls back to "Player" when is_self=false and display_name is empty', async () => {
    mockGetLeaguePlayerStats.mockResolvedValue(
      makeStats({
        is_self: false,
        display_name: '',
        game_history: [GAME_NO_PARTNER],
      }),
    );

    render(<LeagueStatsTab leagueId={1} playerId={42} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats-inner-tab-history')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('stats-inner-tab-history'));

    await waitFor(() => {
      expect(screen.getByTestId(`stats-game-${GAME_NO_PARTNER.id}`)).toBeTruthy();
    });

    expect(screen.getByText(/^Player vs/)).toBeTruthy();
  });
});
