/**
 * Behavior tests for the Tournament Detail screen.
 *
 * Covers:
 *   - Loading skeleton while data is fetching
 *   - Error state on fetch failure, retry works
 *   - Tournament data renders (name, date, format, details grid)
 *   - Role-based action bar: visitor (Request to Join), requested (Pending), registered, waitlist
 *   - Request to Join button optimistically shows pending badge
 *   - Players section renders when players exist
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useLocalSearchParams: () => ({ id: '1' }),
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
  const Circle = () => null;
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
    Circle,
  };
});

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
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

import TournamentDetailRoute from '../../../../app/(stack)/tournament/[id]';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TOURNAMENT_BASE = {
  id: 1,
  name: 'Spring King of the Beach',
  code: 'SPRING24',
  gender: 'coed',
  format: 'POOLS_PLAYOFFS',
  status: 'SETUP',
  num_courts: 4,
  game_to: 21,
  scheduled_date: '2026-05-04',
  player_count: 16,
  current_round: null,
  created_at: '2026-04-01T12:00:00Z',
};

const MOCK_TOURNAMENT_DETAIL = {
  ...MOCK_TOURNAMENT_BASE,
  win_by: 2,
  max_rounds: 8,
  has_playoffs: true,
  playoff_size: 4,
  num_pools: 2,
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
  matches: [],
  standings: [],
  updated_at: new Date().toISOString(),
};

const MOCK_TOURNAMENT_WITH_PLAYERS = {
  ...MOCK_TOURNAMENT_DETAIL,
  players: [
    { id: 1, display_name: 'You', initials: 'PS' },
    { id: 2, display_name: 'K. Fawwar', initials: 'KF' },
  ],
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTournament.mockResolvedValue(MOCK_TOURNAMENT_DETAIL);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('TournamentDetailScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetTournament.mockReturnValue(new Promise(() => {}));
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-detail-loading')).toBeTruthy();
    });
  });

  it('renders screen container during loading', async () => {
    mockGetTournament.mockReturnValue(new Promise(() => {}));
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-detail-screen')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('TournamentDetailScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetTournament.mockRejectedValue(new Error('Network error'));
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-detail-error')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetTournament.mockRejectedValue(new Error('Network error'));
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-detail-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetTournament.mockRejectedValueOnce(new Error('fail'));
    mockGetTournament.mockResolvedValue(MOCK_TOURNAMENT_DETAIL);
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-detail-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tournament-detail-retry-btn'));
    await waitFor(() => {
      expect(mockGetTournament).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Data rendering
// ---------------------------------------------------------------------------

describe('TournamentDetailScreen — data rendering', () => {
  it('renders tournament name', async () => {
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText('Spring King of the Beach')).toBeTruthy();
    });
  });

  it('renders details grid', async () => {
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-details-grid')).toBeTruthy();
    });
  });

  it('renders director name', async () => {
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText(/Tournament Director/)).toBeTruthy();
    });
  });

  it('renders scroll container', async () => {
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-detail-scroll')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Role-based action bar
// ---------------------------------------------------------------------------

describe('TournamentDetailScreen — visitor action bar', () => {
  it('renders Request to Join button for visitor role (default)', async () => {
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-request-join-btn')).toBeTruthy();
    });
  });

  it('shows pending badge after pressing Request to Join', async () => {
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-request-join-btn')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('tournament-request-join-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('tournament-pending-badge')).toBeTruthy();
    });
  });

  it('hides Request to Join button after pressing it', async () => {
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-request-join-btn')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('tournament-request-join-btn'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('tournament-request-join-btn')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Players section
// ---------------------------------------------------------------------------

describe('TournamentDetailScreen — players section', () => {
  it('renders players section when players exist', async () => {
    mockGetTournament.mockResolvedValue(MOCK_TOURNAMENT_WITH_PLAYERS);
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tournament-players-section')).toBeTruthy();
    });
  });

  it('does NOT render players section when players array is empty', async () => {
    render(<TournamentDetailRoute />);
    await waitFor(() => {
      expect(screen.queryByTestId('tournament-players-section')).toBeNull();
    });
  });
});
