/**
 * Tests for the League Dashboard (Standings) tab.
 *
 * Covers:
 *   - Loading state while seasons/standings fetch
 *   - Error state when API fails
 *   - Season picker auto-selects latest season on load
 *   - "All" chip renders and is selectable
 *   - Season chips render for each season
 *   - Standings rows render with rank, name, W-L, win%, rating
 *   - Empty state when standings list is empty
 *   - Season info card renders when season_info is present
 *   - Pressing a standing row navigates to the player screen
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ id: '1' }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

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

import LeagueDashboardTab from '../../../../src/components/screens/Leagues/LeagueDashboardTab';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const MOCK_SEASONS = [
  { id: 3, name: 'Summer 2025', is_active: true, start_date: '2025-06-01', end_date: null },
  { id: 2, name: 'Spring 2025', is_active: false, start_date: '2025-03-01', end_date: '2025-05-31' },
  { id: 1, name: 'Winter 2024', is_active: false, start_date: '2024-12-01', end_date: '2025-02-28' },
];

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
    {
      rank: 2,
      player_id: 11,
      display_name: 'J. Smith',
      initials: 'JS',
      avatar_url: null,
      wins: 6,
      losses: 4,
      win_rate: 60,
      rating: 1480,
      rating_delta: -5,
      games_played: 10,
    },
  ],
  season_info: {
    id: 3,
    name: 'Summer 2025',
    started_at: '2025-06-01T00:00:00',
    ended_at: '2025-08-31T00:00:00',
    session_count: 8,
    game_count: 40,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLeagueSeasons.mockResolvedValue(MOCK_SEASONS);
  mockGetLeagueStandings.mockResolvedValue(MOCK_STANDINGS_RESPONSE);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('LeagueDashboardTab — loading', () => {
  it('shows loading indicator while data is fetching', async () => {
    mockGetLeagueSeasons.mockReturnValue(new Promise(() => {}));
    mockGetLeagueStandings.mockReturnValue(new Promise(() => {}));

    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    expect(screen.getByTestId('standings-loading')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('LeagueDashboardTab — error', () => {
  it('shows error state when seasons query fails', async () => {
    mockGetLeagueSeasons.mockRejectedValue(new Error('Network error'));

    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('standings-error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Season picker
// ---------------------------------------------------------------------------

describe('LeagueDashboardTab — season picker', () => {
  it('renders "All" chip', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('season-pill-all')).toBeTruthy();
    });
  });

  it('renders a chip for each season', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('season-pill-3')).toBeTruthy();
      expect(screen.getByTestId('season-pill-2')).toBeTruthy();
      expect(screen.getByTestId('season-pill-1')).toBeTruthy();
    });
  });

  it('auto-selects the latest season (index 0) on load', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(mockGetLeagueStandings).toHaveBeenCalledWith(1, 3);
    });
  });

  it('calls getLeagueStandings without season_id when "All" is pressed', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('season-pill-all')).toBeTruthy());
    fireEvent.press(screen.getByTestId('season-pill-all'));

    await waitFor(() => {
      expect(mockGetLeagueStandings).toHaveBeenCalledWith(1, undefined);
    });
  });

  it('calls getLeagueStandings with season_id when a season chip is pressed', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('season-pill-2')).toBeTruthy());
    fireEvent.press(screen.getByTestId('season-pill-2'));

    await waitFor(() => {
      expect(mockGetLeagueStandings).toHaveBeenCalledWith(1, 2);
    });
  });
});

// ---------------------------------------------------------------------------
// Standings table
// ---------------------------------------------------------------------------

describe('LeagueDashboardTab — standings', () => {
  it('renders standings rows after data loads', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('standings-row-10')).toBeTruthy();
      expect(screen.getByTestId('standings-row-11')).toBeTruthy();
    });
  });

  it('shows rank, W-L, and win% for each row', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('8-2')).toBeTruthy();
      expect(screen.getByText('80%')).toBeTruthy();
    });
  });

  it('shows "No standings yet" when standings array is empty', async () => {
    mockGetLeagueStandings.mockResolvedValue({ standings: [], season_info: null });

    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('No standings yet')).toBeTruthy();
    });
  });

  it('navigates to player screen on row press', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('standings-row-10')).toBeTruthy());
    fireEvent.press(screen.getByTestId('standings-row-10'));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('10'));
  });
});

// ---------------------------------------------------------------------------
// Season info card
// ---------------------------------------------------------------------------

describe('LeagueDashboardTab — season info card', () => {
  it('renders season info card when season_info is present', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('season-info-card')).toBeTruthy();
    });
  });

  it('does not render season info card when season_info is null', async () => {
    mockGetLeagueStandings.mockResolvedValue({ standings: [], season_info: null });

    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.queryByTestId('season-info-card')).toBeNull();
    });
  });

  it('uses season name as card title', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Summer 2025')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// PTS vs Rating column label
// ---------------------------------------------------------------------------

describe('LeagueDashboardTab — column label', () => {
  it('shows "Rating" header when "All" is selected', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('season-pill-all')).toBeTruthy());
    fireEvent.press(screen.getByTestId('season-pill-all'));

    await waitFor(() => {
      expect(screen.getByTestId('sort-by-rating')).toBeTruthy();
      expect(screen.getByText('Rating')).toBeTruthy();
    });
  });

  it('shows "PTS" header when a specific season is selected', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText('PTS')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

describe('LeagueDashboardTab — sort', () => {
  it('sorts by win rate descending when Win% header is pressed', async () => {
    mockGetLeagueStandings.mockResolvedValue({
      ...MOCK_STANDINGS_RESPONSE,
      standings: [
        { ...MOCK_STANDINGS_RESPONSE.standings[0], rank: 1, win_rate: 80 },
        { ...MOCK_STANDINGS_RESPONSE.standings[1], rank: 2, win_rate: 60 },
      ],
    });

    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('sort-by-win-rate')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sort-by-win-rate'));

    await waitFor(() => {
      const rows = screen.getAllByTestId(/standings-row/);
      expect(rows[0].props.testID).toBe('standings-row-10');
    });
  });

  it('sort header is pressable', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('sort-by-rating')).toBeTruthy());
    expect(() => fireEvent.press(screen.getByTestId('sort-by-rating'))).not.toThrow();
  });

  it('sorts by player last name ascending when Player header is pressed', async () => {
    mockGetLeagueStandings.mockResolvedValue({
      ...MOCK_STANDINGS_RESPONSE,
      standings: [
        { ...MOCK_STANDINGS_RESPONSE.standings[0], rank: 1, display_name: 'P. Schwagler' },
        { ...MOCK_STANDINGS_RESPONSE.standings[1], rank: 2, display_name: 'J. Smith' },
      ],
    });

    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('sort-by-name')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sort-by-name'));

    await waitFor(() => {
      const rows = screen.getAllByTestId(/standings-row/);
      // 'Schwagler' < 'Smith' alphabetically
      expect(rows[0].props.testID).toBe('standings-row-10');
      expect(rows[1].props.testID).toBe('standings-row-11');
    });

    // Pressing again toggles to descending
    fireEvent.press(screen.getByTestId('sort-by-name'));
    await waitFor(() => {
      const rows = screen.getAllByTestId(/standings-row/);
      expect(rows[0].props.testID).toBe('standings-row-11');
    });
  });

  it('# header press restores default rank ordering', async () => {
    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('sort-by-rating')).toBeTruthy());

    // Switch to a non-default sort first
    fireEvent.press(screen.getByTestId('sort-by-win-rate'));
    await waitFor(() => screen.getAllByTestId(/standings-row/));

    // # header restores backend rank order (rank 1 first)
    fireEvent.press(screen.getByTestId('sort-by-rank'));
    await waitFor(() => {
      const rows = screen.getAllByTestId(/standings-row/);
      expect(rows[0].props.testID).toBe('standings-row-10');
      expect(rows[1].props.testID).toBe('standings-row-11');
    });
  });

  it('W-L header sorts by wins descending', async () => {
    mockGetLeagueStandings.mockResolvedValue({
      ...MOCK_STANDINGS_RESPONSE,
      standings: [
        { ...MOCK_STANDINGS_RESPONSE.standings[1], rank: 1, wins: 3 },
        { ...MOCK_STANDINGS_RESPONSE.standings[0], rank: 2, wins: 9 },
      ],
    });

    render(<LeagueDashboardTab leagueId={1} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('sort-by-wins')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sort-by-wins'));

    await waitFor(() => {
      const rows = screen.getAllByTestId(/standings-row/);
      // Player 10 has 9 wins, should now be first
      expect(rows[0].props.testID).toBe('standings-row-10');
    });
  });
});
