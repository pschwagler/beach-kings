/**
 * Behavior tests for the King of the Beach (KoB) tournament screen.
 *
 * Covers:
 *   - Loading skeleton renders while data is loading
 *   - Error state renders on fetch failure, retry works
 *   - Tournament header renders (name, status badge, round label)
 *   - Tab bar renders with Live/Schedule/Standings tabs
 *   - Live panel renders in-progress and completed matches
 *   - Schedule panel renders round cards with status badges
 *   - Standings panel renders player rows with W/L/PF/PA/+/- columns
 *   - Tab switching shows the correct panel without refetching
 *   - Standings: positive diff is rendered, negative diff is rendered
 *   - Director panel renders view-only in live tab
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => ({ code: 'MB2026' }),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => <View testID="slot">{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID ?? 'safe-area-view'}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    Easing: { inOut: () => ({}), ease: {} },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
  };
});

const mockHapticLight = jest.fn().mockResolvedValue(undefined);
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/haptics', () => ({
  hapticLight: () => mockHapticLight(),
  hapticMedium: () => mockHapticMedium(),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockGetTournament = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getTournament: (...args: unknown[]) => mockGetTournament(...args),
  },
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import KobRoute from '../../../../app/(stack)/kob/[code]';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_IN_PROGRESS_MATCH = {
  id: 201,
  matchup_id: 'r3-ct1',
  round_num: 3,
  phase: 'pool_play',
  pool_id: null,
  court_num: 1,
  team1_player1_id: 1,
  team1_player2_id: 2,
  team2_player1_id: 3,
  team2_player2_id: 4,
  team1_player1_name: 'Patrick S.',
  team1_player2_name: 'Ken F.',
  team2_player1_name: 'Colan G.',
  team2_player2_name: 'Alex M.',
  team1_score: null,
  team2_score: null,
  winner: null,
  game_scores: null,
  bracket_position: null,
  is_bye: false,
};

const MOCK_COMPLETED_MATCH = {
  id: 199,
  matchup_id: 'r3-ct1-done',
  round_num: 3,
  phase: 'pool_play',
  pool_id: null,
  court_num: 1,
  team1_player1_id: 9,
  team1_player2_id: 10,
  team2_player1_id: 11,
  team2_player2_id: 12,
  team1_player1_name: 'Dan B.',
  team1_player2_name: 'Mike R.',
  team2_player1_name: 'Rob P.',
  team2_player2_name: 'Joey T.',
  team1_score: 21,
  team2_score: 17,
  winner: 1,
  game_scores: null,
  bracket_position: null,
  is_bye: false,
};

const MOCK_STANDING_1 = {
  player_id: 1,
  player_name: 'Patrick S.',
  player_avatar: null,
  rank: 1,
  wins: 4,
  losses: 0,
  points_for: 84,
  points_against: 51,
  point_diff: 33,
  pool_id: null,
};

const MOCK_STANDING_LAST = {
  player_id: 8,
  player_name: 'Rafael T.',
  player_avatar: null,
  rank: 8,
  wins: 0,
  losses: 4,
  points_for: 47,
  points_against: 84,
  point_diff: -37,
  pool_id: null,
};

const MOCK_TOURNAMENT_DETAIL = {
  id: 1,
  name: 'Manhattan Beach KoB',
  code: 'MB2026',
  gender: 'mens',
  format: 'king_of_the_beach',
  status: 'active',
  num_courts: 2,
  game_to: 21,
  scheduled_date: '2026-04-20',
  player_count: 8,
  current_round: 3,
  created_at: '2026-04-01T00:00:00Z',
  win_by: 2,
  max_rounds: 7,
  has_playoffs: true,
  playoff_size: 4,
  num_pools: 1,
  games_per_match: 1,
  num_rr_cycles: 1,
  score_cap: 25,
  playoff_format: 'single_elim',
  playoff_game_to: 21,
  playoff_games_per_match: 1,
  playoff_score_cap: 25,
  is_ranked: true,
  current_phase: 'pool_play',
  auto_advance: true,
  director_player_id: null,
  director_name: 'Tournament Director',
  league_id: null,
  location_id: null,
  schedule_data: null,
  players: [],
  matches: [MOCK_IN_PROGRESS_MATCH, MOCK_COMPLETED_MATCH],
  standings: [MOCK_STANDING_1, MOCK_STANDING_LAST],
  updated_at: '2026-04-20T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockHapticLight.mockResolvedValue(undefined);
  mockHapticMedium.mockResolvedValue(undefined);
  mockGetTournament.mockResolvedValue(MOCK_TOURNAMENT_DETAIL);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('KobScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetTournament.mockReturnValue(new Promise(() => {}));
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('KobScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetTournament.mockRejectedValue(new Error('Network error'));
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-error-state')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetTournament.mockRejectedValue(new Error('Network error'));
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetTournament.mockRejectedValueOnce(new Error('fail'));
    mockGetTournament.mockResolvedValue(MOCK_TOURNAMENT_DETAIL);
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('kob-retry-btn'));
    await waitFor(() => {
      expect(mockGetTournament).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Tournament header
// ---------------------------------------------------------------------------

describe('KobScreen — tournament header', () => {
  it('renders the screen container', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-screen')).toBeTruthy();
    });
  });

  it('renders tournament name in header', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Manhattan Beach KoB')).toBeTruthy();
    });
  });

  it('renders Active status badge', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeTruthy();
    });
  });

  it('renders round label for active tournament', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Round 3 of 7')).toBeTruthy();
    });
  });

  it('renders tournament header container', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-tournament-header')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

describe('KobScreen — tab bar', () => {
  it('renders Live tab', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Live')).toBeTruthy();
    });
  });

  it('renders Schedule tab', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Schedule')).toBeTruthy();
    });
  });

  it('renders Standings tab', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Live panel
// ---------------------------------------------------------------------------

describe('KobScreen — Live panel', () => {
  it('renders live panel by default', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-live-panel')).toBeTruthy();
    });
  });

  it('renders in-progress match card', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-match-card-201')).toBeTruthy();
    });
  });

  it('renders completed match card', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-match-card-199')).toBeTruthy();
    });
  });

  it('shows "In Progress" section label', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('In Progress')).toBeTruthy();
    });
  });

  it('shows "Completed This Round" section label', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Completed This Round')).toBeTruthy();
    });
  });

  it('shows score entry placeholder for in-progress match', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-submit-score-201')).toBeTruthy();
    });
  });

  it('renders director panel as view-only', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-director-panel')).toBeTruthy();
    });
  });

  it('renders vs for in-progress match', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('vs')).toBeTruthy();
    });
  });

  it('renders final score for completed match', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('21 - 17')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Schedule panel
// ---------------------------------------------------------------------------

describe('KobScreen — Schedule panel', () => {
  it('switches to schedule panel when Schedule tab is pressed', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Schedule')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(screen.getByTestId('kob-schedule-panel')).toBeTruthy();
    });
  });

  it('renders round card for current round', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Schedule')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(screen.getByTestId('kob-round-card-3')).toBeTruthy();
    });
  });

  it('renders round cards for all rounds up to max_rounds', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Schedule')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Schedule'));
    await waitFor(() => {
      // Rounds 1-7 for max_rounds=7
      for (let r = 1; r <= 7; r++) {
        expect(screen.getByTestId(`kob-round-card-${r}`)).toBeTruthy();
      }
    });
  });

  it('does not refetch data when switching to Schedule tab', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Schedule')).toBeTruthy();
    });
    const callsBefore = mockGetTournament.mock.calls.length;
    fireEvent.press(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(screen.getByTestId('kob-schedule-panel')).toBeTruthy();
    });
    // Should not have made another API call
    expect(mockGetTournament.mock.calls.length).toBe(callsBefore);
  });
});

// ---------------------------------------------------------------------------
// Standings panel
// ---------------------------------------------------------------------------

describe('KobScreen — Standings panel', () => {
  it('switches to standings panel when Standings tab is pressed', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Standings'));
    await waitFor(() => {
      expect(screen.getByTestId('kob-standings-panel')).toBeTruthy();
    });
  });

  it('renders player rows in standings', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Standings'));
    await waitFor(() => {
      expect(screen.getByTestId('kob-standing-row-1')).toBeTruthy();
      expect(screen.getByTestId('kob-standing-row-8')).toBeTruthy();
    });
  });

  it('renders wins and losses columns', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Standings'));
    await waitFor(() => {
      // Player 1 has 4 wins, 0 losses
      expect(screen.getByText('W')).toBeTruthy();
      expect(screen.getByText('L')).toBeTruthy();
    });
  });

  it('renders positive point diff for rank-1 player', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Standings'));
    await waitFor(() => {
      expect(screen.getByText('+33')).toBeTruthy();
    });
  });

  it('renders negative point diff for last-place player', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Standings'));
    await waitFor(() => {
      expect(screen.getByText('-37')).toBeTruthy();
    });
  });

  it('renders tiebreaker note at bottom', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Standings'));
    await waitFor(() => {
      expect(screen.getByText(/Tiebreakers/i)).toBeTruthy();
    });
  });

  it('does not refetch data when switching to Standings tab', async () => {
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
    const callsBefore = mockGetTournament.mock.calls.length;
    fireEvent.press(screen.getByText('Standings'));
    await waitFor(() => {
      expect(screen.getByTestId('kob-standings-panel')).toBeTruthy();
    });
    expect(mockGetTournament.mock.calls.length).toBe(callsBefore);
  });
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

describe('KobScreen — empty states', () => {
  it('shows live empty state when no matches in current round', async () => {
    const emptyMatchesTournament = {
      ...MOCK_TOURNAMENT_DETAIL,
      matches: [],
    };
    mockGetTournament.mockResolvedValue(emptyMatchesTournament);
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('kob-live-empty')).toBeTruthy();
    });
  });

  it('shows standings empty state when no standings', async () => {
    const emptyStandingsTournament = {
      ...MOCK_TOURNAMENT_DETAIL,
      standings: [],
    };
    mockGetTournament.mockResolvedValue(emptyStandingsTournament);
    render(<KobRoute />);
    await waitFor(() => {
      expect(screen.getByText('Standings')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Standings'));
    await waitFor(() => {
      expect(screen.getByTestId('kob-standings-empty')).toBeTruthy();
    });
  });
});
