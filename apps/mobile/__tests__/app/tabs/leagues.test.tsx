/**
 * Behavior tests for the Leagues tab screen.
 *
 * Tests what the user sees across all states:
 *   - loading skeleton
 *   - populated league cards
 *   - empty state with actionable CTA
 *   - error state with retry
 *   - navigation on league card tap
 *   - pull-to-refresh triggers refetch
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

// ---------------------------------------------------------------------------
// API mock
// ---------------------------------------------------------------------------

const mockGetUserLeagues = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getUserLeagues: (...args: unknown[]) => mockGetUserLeagues(...args),
    getCurrentUserPlayer: (...args: unknown[]) =>
      mockGetCurrentUserPlayer(...args),
  },
}));

// React Query — real cache with short retry=0 so failures are instant
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAYER_FIXTURE = {
  id: 1,
  name: 'Test Player',
  first_name: 'Test',
  last_name: 'Player',
  wins: 34,
  losses: 13,
  current_rating: 1520,
};

const LEAGUE_FIXTURE = {
  id: 101,
  name: 'QBK Open Men - Mornings',
  location_name: 'Queens, NY',
  member_count: 27,
  games_played: 47,
  current_season: { name: 'Spring 2025', is_active: true },
  standings: [
    {
      player_id: 1,
      name: 'Test Player',
      elo: 1600,
      points: 120,
      games: 47,
      wins: 34,
      losses: 13,
      win_rate: 0.72,
      avg_pt_diff: 3.5,
      season_rank: 1,
    },
  ],
};

const SECOND_LEAGUE_FIXTURE = {
  id: 202,
  name: 'NYC Fun League',
  location_name: 'New York City Metro',
  member_count: 2,
  games_played: 12,
  current_season: { name: 'Spring 2025', is_active: true },
  standings: [
    {
      player_id: 1,
      name: 'Test Player',
      elo: 1520,
      points: 40,
      games: 12,
      wins: 8,
      losses: 4,
      win_rate: 0.67,
      avg_pt_diff: 2.0,
      season_rank: 3,
    },
  ],
};

// ---------------------------------------------------------------------------
// Import screen AFTER mocks are configured
// ---------------------------------------------------------------------------

import LeaguesScreen from '../../../app/(tabs)/leagues';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeaguesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: instant resolution
    mockGetCurrentUserPlayer.mockResolvedValue(PLAYER_FIXTURE);
    mockGetUserLeagues.mockResolvedValue([LEAGUE_FIXTURE]);
  });

  // ---- Loading state -------------------------------------------------------

  it('shows skeleton while data is loading', async () => {
    // Delay resolution so we can catch the loading state
    mockGetUserLeagues.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([LEAGUE_FIXTURE]), 200);
        }),
    );
    mockGetCurrentUserPlayer.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(PLAYER_FIXTURE), 200);
        }),
    );

    const { getByTestId } = renderWithQuery(<LeaguesScreen />);
    expect(getByTestId('leagues-skeleton')).toBeTruthy();
  });

  // ---- Loaded state --------------------------------------------------------

  it('shows league cards after data loads', async () => {
    const { getByTestId, getByText } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByTestId('league-card-101')).toBeTruthy();
    });

    expect(getByText('QBK Open Men - Mornings')).toBeTruthy();
  });

  it('shows W-L record and win rate for the user in each league', async () => {
    const { getByText } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByText('34-13')).toBeTruthy();
      expect(getByText('72%')).toBeTruthy();
    });
  });

  it('shows rank badge when user has a ranking in the league', async () => {
    const { getByText } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByText('1st Ranked')).toBeTruthy();
    });
  });

  it('renders a card for each league returned by the API', async () => {
    mockGetUserLeagues.mockResolvedValue([
      LEAGUE_FIXTURE,
      SECOND_LEAGUE_FIXTURE,
    ]);

    const { getByTestId } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByTestId('league-card-101')).toBeTruthy();
      expect(getByTestId('league-card-202')).toBeTruthy();
    });
  });

  // ---- Empty state ---------------------------------------------------------

  it('shows empty state when user has no leagues', async () => {
    mockGetUserLeagues.mockResolvedValue([]);

    const { getByTestId } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByTestId('leagues-empty-state')).toBeTruthy();
    });
  });

  it('empty state has a "Find a League" CTA that navigates to find-leagues', async () => {
    mockGetUserLeagues.mockResolvedValue([]);

    const { getByTestId } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByTestId('find-leagues-cta')).toBeTruthy();
    });

    fireEvent.press(getByTestId('find-leagues-cta'));

    expect(mockPush).toHaveBeenCalledWith('/(stack)/find-leagues');
  });

  // ---- Error state ---------------------------------------------------------

  it('shows error state when leagues API fails', async () => {
    mockGetUserLeagues.mockRejectedValue(new Error('Network error'));

    const { getByTestId } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByTestId('leagues-error-state')).toBeTruthy();
    });
  });

  it('retry button refetches data and shows leagues on success', async () => {
    mockGetUserLeagues
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([LEAGUE_FIXTURE]);

    const { getByTestId, queryByTestId } = renderWithQuery(<LeaguesScreen />);

    // Wait for error state
    await waitFor(() => {
      expect(getByTestId('leagues-error-state')).toBeTruthy();
    });

    // Press retry
    fireEvent.press(getByTestId('retry-btn'));

    // Error state should disappear and league card should appear
    await waitFor(() => {
      expect(queryByTestId('leagues-error-state')).toBeNull();
      expect(getByTestId('league-card-101')).toBeTruthy();
    });
  });

  // ---- Navigation ----------------------------------------------------------

  it('tapping a league card navigates to league detail', async () => {
    const { getByTestId } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByTestId('league-card-101')).toBeTruthy();
    });

    fireEvent.press(getByTestId('league-card-101'));

    expect(mockPush).toHaveBeenCalledWith('/(stack)/league/101');
  });

  it('tapping Find Leagues action bar button navigates to find-leagues', async () => {
    const { getByTestId } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByTestId('find-leagues-btn')).toBeTruthy();
    });

    fireEvent.press(getByTestId('find-leagues-btn'));

    expect(mockPush).toHaveBeenCalledWith('/(stack)/find-leagues');
  });

  it('tapping Create League action bar button navigates to create-league', async () => {
    const { getByTestId } = renderWithQuery(<LeaguesScreen />);

    await waitFor(() => {
      expect(getByTestId('create-league-btn')).toBeTruthy();
    });

    fireEvent.press(getByTestId('create-league-btn'));

    expect(mockPush).toHaveBeenCalledWith('/(stack)/create-league');
  });

  // ---- Pull-to-refresh -----------------------------------------------------

  it('pull-to-refresh triggers API refetch', async () => {
    let resolveRefresh!: (v: unknown[]) => void;
    const refreshPromise = new Promise<unknown[]>((res) => {
      resolveRefresh = res;
    });

    // First call returns immediately; second call (refresh) uses a promise we control
    mockGetUserLeagues
      .mockResolvedValueOnce([LEAGUE_FIXTURE])
      .mockImplementationOnce(() => {
        resolveRefresh([LEAGUE_FIXTURE]);
        return Promise.resolve([LEAGUE_FIXTURE]);
      });

    const { getByTestId, UNSAFE_root } = renderWithQuery(<LeaguesScreen />);

    // Wait for initial load
    await waitFor(() => {
      expect(getByTestId('league-card-101')).toBeTruthy();
    });

    // Find the ScrollView and fire its onRefresh via the refreshControl prop
    const scrollViewNode = UNSAFE_root.findByType(
      require('react-native').ScrollView,
    );
    const { onRefresh } = (scrollViewNode.props as { refreshControl?: { props?: { onRefresh?: () => void } } })
      .refreshControl?.props ?? {};

    await act(async () => {
      onRefresh?.();
      await refreshPromise;
    });

    // API should have been called twice (initial + refresh)
    expect(mockGetUserLeagues).toHaveBeenCalledTimes(2);
  });
});
