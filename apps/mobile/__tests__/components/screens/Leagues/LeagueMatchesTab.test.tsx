/**
 * Tests for LeagueMatchesTab.
 *
 * Covers:
 *  - My/All segmented toggle wiring + on-demand fetch of league-wide games
 *  - Active-state visual treatment on SessionCard (LIVE pill, accent stripe)
 *  - Footer adapts (hides W/L/rating) for active 'mine' sessions
 *  - Team-neutral game rows in 'all' mode
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetMyGames = jest.fn();
const mockGetLeagueGames = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getMyGames: (...args: unknown[]) => mockGetMyGames(...args),
    getLeagueGames: (...args: unknown[]) => mockGetLeagueGames(...args),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// usePaletteColors reads from ThemeContext; stub it so SessionCard can render
// without a ThemeProvider in the test tree.
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textMuted: '#888888' }),
}));

import LeagueMatchesTab from '@/components/screens/Leagues/LeagueMatchesTab';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MY_GAME_SUBMITTED = {
  id: 1,
  session_id: 100,
  court_label: null,
  league_name: 'Open',
  league_id: 5,
  result: 'W' as const,
  my_score: 21,
  opponent_score: 18,
  partner_names: ['Alice'],
  partner_ids: [10],
  opponent_names: ['Bob', 'Charlie'],
  opponent_ids: [11, 12],
  session_date: '2024-06-01',
  rating_change: 5,
  session_submitted: true,
};

const MY_GAME_ACTIVE = {
  ...MY_GAME_SUBMITTED,
  id: 2,
  session_id: 200,
  rating_change: null,
  session_submitted: false,
};

const ALL_GAME_ACTIVE = {
  id: 50,
  session_id: 200,
  session_date: '2024-06-02',
  session_status: 'ACTIVE' as const,
  court_label: null,
  team1_player_names: ['Alice', 'Bob'],
  team1_player_ids: [10, 11],
  team2_player_names: ['Charlie', 'Dave'],
  team2_player_ids: [12, 13],
  team1_score: 21,
  team2_score: 14,
  winner: 1 as const,
};

const ALL_GAME_SUBMITTED = {
  ...ALL_GAME_ACTIVE,
  id: 51,
  session_id: 100,
  session_status: 'SUBMITTED' as const,
};

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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyGames.mockResolvedValue({ games: [], total: 0 });
  mockGetLeagueGames.mockResolvedValue({ games: [], total: 0 });
});

// ---------------------------------------------------------------------------
// Toggle behavior
// ---------------------------------------------------------------------------

describe('LeagueMatchesTab — toggle', () => {
  it('renders the My/All segmented toggle', async () => {
    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('league-games-mode-toggle')).toBeTruthy();
    });
    expect(screen.getByTestId('league-games-mode-mine')).toBeTruthy();
    expect(screen.getByTestId('league-games-mode-all')).toBeTruthy();
  });

  it('defaults to My Games mode and only fetches my games initially', async () => {
    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(mockGetMyGames).toHaveBeenCalled();
    });
    // All-games endpoint should NOT have been hit yet.
    expect(mockGetLeagueGames).not.toHaveBeenCalled();
  });

  it('fetches league-wide games only after switching to All Games', async () => {
    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(mockGetMyGames).toHaveBeenCalled());
    expect(mockGetLeagueGames).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('league-games-mode-all'));

    await waitFor(() => {
      expect(mockGetLeagueGames).toHaveBeenCalledWith(5);
    });
  });
});

// ---------------------------------------------------------------------------
// Active-state styling
// ---------------------------------------------------------------------------

describe('LeagueMatchesTab — active session styling (mine)', () => {
  it('renders LIVE pill and accent stripe for an active session', async () => {
    mockGetMyGames.mockResolvedValue({ games: [MY_GAME_ACTIVE], total: 1 });

    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId(`session-card-${MY_GAME_ACTIVE.session_id}`)).toBeTruthy();
    });
    expect(
      screen.getByTestId(`session-card-${MY_GAME_ACTIVE.session_id}-live-pill`),
    ).toBeTruthy();
    expect(
      screen.getByTestId(`session-card-${MY_GAME_ACTIVE.session_id}-active-stripe`),
    ).toBeTruthy();
  });

  it('does NOT render LIVE pill for a submitted session', async () => {
    mockGetMyGames.mockResolvedValue({ games: [MY_GAME_SUBMITTED], total: 1 });

    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId(`session-card-${MY_GAME_SUBMITTED.session_id}`)).toBeTruthy();
    });
    expect(
      screen.queryByTestId(`session-card-${MY_GAME_SUBMITTED.session_id}-live-pill`),
    ).toBeNull();
    expect(
      screen.queryByTestId(`session-card-${MY_GAME_SUBMITTED.session_id}-active-stripe`),
    ).toBeNull();
  });

  it('sorts active sessions above submitted sessions', async () => {
    mockGetMyGames.mockResolvedValue({
      games: [MY_GAME_SUBMITTED, MY_GAME_ACTIVE],
      total: 2,
    });

    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId(`session-card-${MY_GAME_ACTIVE.session_id}`)).toBeTruthy();
    });

    // Active session card should appear before the submitted one in document order.
    const root = screen.getByTestId('matches-tab');
    const activeCard = screen.getByTestId(`session-card-${MY_GAME_ACTIVE.session_id}`);
    const submittedCard = screen.getByTestId(
      `session-card-${MY_GAME_SUBMITTED.session_id}`,
    );

    function indexOf(node: unknown): number {
      const flatten = (n: unknown, acc: unknown[] = []): unknown[] => {
        // @ts-expect-error — RN test renderer exposes children loosely.
        const children = n?.children ?? [];
        acc.push(n);
        children.forEach((c: unknown) => flatten(c, acc));
        return acc;
      };
      return flatten(root).indexOf(node);
    }

    expect(indexOf(activeCard)).toBeLessThan(indexOf(submittedCard));
  });
});

// ---------------------------------------------------------------------------
// All Games rendering
// ---------------------------------------------------------------------------

describe('LeagueMatchesTab — All Games rendering', () => {
  it('renders team-neutral rows after switching to All Games', async () => {
    mockGetLeagueGames.mockResolvedValue({
      games: [ALL_GAME_ACTIVE, ALL_GAME_SUBMITTED],
      total: 2,
    });

    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(mockGetMyGames).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('league-games-mode-all'));

    await waitFor(() => {
      expect(screen.getByTestId(`league-game-row-${ALL_GAME_ACTIVE.id}`)).toBeTruthy();
    });
    expect(screen.getByTestId(`league-game-row-${ALL_GAME_SUBMITTED.id}`)).toBeTruthy();
    // Active session card in All Games mode also gets the LIVE pill.
    expect(
      screen.getByTestId(`session-card-${ALL_GAME_ACTIVE.session_id}-live-pill`),
    ).toBeTruthy();
  });

  it('renders a TIE badge for a drawn game, distinct from an unscored game', async () => {
    const tieGame = { ...ALL_GAME_SUBMITTED, id: 60, winner: -1 as const };
    const unscoredGame = {
      ...ALL_GAME_SUBMITTED,
      id: 61,
      session_id: 100,
      winner: 0 as const,
    };
    mockGetLeagueGames.mockResolvedValue({
      games: [tieGame, unscoredGame],
      total: 2,
    });

    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(mockGetMyGames).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('league-games-mode-all'));

    await waitFor(() => {
      expect(screen.getByTestId(`league-game-tie-${tieGame.id}`)).toBeTruthy();
    });
    // Tie and unscored render different badges.
    expect(screen.queryByTestId(`league-game-noresult-${tieGame.id}`)).toBeNull();
    expect(
      screen.getByTestId(`league-game-noresult-${unscoredGame.id}`),
    ).toBeTruthy();
    expect(screen.queryByTestId(`league-game-tie-${unscoredGame.id}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('LeagueMatchesTab — empty state', () => {
  it('shows "No Games Yet" empty message in My mode', async () => {
    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('matches-empty')).toBeTruthy());
    expect(screen.getByText('No Games Yet')).toBeTruthy();
  });

  it('shows "No League Games Yet" empty message in All mode', async () => {
    render(<LeagueMatchesTab leagueId={5} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('matches-empty')).toBeTruthy());

    fireEvent.press(screen.getByTestId('league-games-mode-all'));

    await waitFor(() => {
      expect(screen.getByText('No League Games Yet')).toBeTruthy();
    });
  });
});
