/**
 * Behavior tests for the Session Detail screen.
 *
 * Covers:
 *   - Loading skeleton renders while data is fetching
 *   - Error state renders on fetch failure, retry works
 *   - Session data renders (header, stats bar, roster strip, games)
 *   - Active sessions show sticky action bar (Add Game, Submit Session)
 *   - Submitted sessions do NOT show sticky action bar
 *   - ··· menu button opens the bottom sheet
 *   - Invite banner shows when placeholder players exist
 *   - "No games" empty state renders when games list is empty
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

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
    useLocalSearchParams: () => ({ id: '42' }),
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

const mockGetSessionById = jest.fn();
const mockLockInSession = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    lockInSession: (...args: unknown[]) => mockLockInSession(...args),
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

import SessionDetailRoute from '../../../../app/(stack)/session/[id]';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PLAYERS = [
  { id: 1, player_id: 1, display_name: 'You', initials: 'PS', is_placeholder: false, game_count: 5 },
  { id: 2, player_id: 2, display_name: 'K. Fawwar', initials: 'KF', is_placeholder: false, game_count: 5 },
];

const MOCK_PLAYERS_WITH_PLACEHOLDER = [
  ...MOCK_PLAYERS,
  { id: 4, player_id: null, display_name: 'Player 4', initials: 'P4', is_placeholder: true, game_count: 0 },
];

const MOCK_GAMES = [
  {
    id: 1001, game_number: 1,
    team1_player1_name: 'You', team1_player2_name: 'K. Fawwar',
    team2_player1_name: 'A. Marthey', team2_player2_name: 'C. Gulla',
    team1_score: 21, team2_score: 16, winner: 1, rating_change: 4.2,
  },
];

const MOCK_SESSION_ACTIVE = {
  id: 42,
  league_id: 1,
  league_name: 'QBK Open Men',
  court_name: 'QBK Sports',
  date: '2026-03-19',
  start_time: '3:00 PM',
  session_number: 3,
  status: 'active' as const,
  session_type: 'league' as const,
  max_players: 16,
  notes: null,
  players: MOCK_PLAYERS,
  games: MOCK_GAMES,
  user_wins: 5,
  user_losses: 2,
  user_rating_change: 8.9,
};

const MOCK_SESSION_SUBMITTED = {
  ...MOCK_SESSION_ACTIVE,
  status: 'submitted' as const,
};

const MOCK_SESSION_NO_GAMES = {
  ...MOCK_SESSION_ACTIVE,
  games: [],
};

const MOCK_SESSION_WITH_PLACEHOLDER = {
  ...MOCK_SESSION_ACTIVE,
  players: MOCK_PLAYERS_WITH_PLACEHOLDER,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSessionById.mockResolvedValue(MOCK_SESSION_ACTIVE);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('SessionDetailScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetSessionById.mockReturnValue(new Promise(() => {}));
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-loading')).toBeTruthy();
    });
  });

  it('renders the screen container during loading', async () => {
    mockGetSessionById.mockReturnValue(new Promise(() => {}));
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-screen')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('SessionDetailScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetSessionById.mockRejectedValue(new Error('Network error'));
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-error')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetSessionById.mockRejectedValue(new Error('Network error'));
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetSessionById.mockRejectedValueOnce(new Error('fail'));
    mockGetSessionById.mockResolvedValue(MOCK_SESSION_ACTIVE);
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('session-detail-retry-btn'));
    await waitFor(() => {
      expect(mockGetSessionById).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Data rendering
// ---------------------------------------------------------------------------

describe('SessionDetailScreen — data rendering', () => {
  it('renders session data after load', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-detail-screen')).toBeTruthy();
    });
  });

  it('renders stats bar', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-stats-bar')).toBeTruthy();
    });
  });

  it('renders roster strip', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-roster-strip')).toBeTruthy();
    });
  });

  it('renders league name in session header', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText('QBK Open Men')).toBeTruthy();
    });
  });

  it('renders session number in header', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByText(/Session #3/)).toBeTruthy();
    });
  });

  it('renders player chips for each player', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-chip-1')).toBeTruthy();
      expect(screen.getByTestId('player-chip-2')).toBeTruthy();
    });
  });

  it('renders game cards for each game', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-game-card-1001')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Active session sticky action bar
// ---------------------------------------------------------------------------

describe('SessionDetailScreen — active session actions', () => {
  it('renders Add Game button for active sessions', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-add-game-btn')).toBeTruthy();
    });
  });

  it('renders Submit Session button for active sessions', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-submit-btn')).toBeTruthy();
    });
  });

  it('navigates to add-games when Add Game is pressed', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-add-game-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('session-add-game-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/add-games');
  });
});

// ---------------------------------------------------------------------------
// Submitted session — no action bar
// ---------------------------------------------------------------------------

describe('SessionDetailScreen — submitted session', () => {
  it('does NOT render Add Game button for submitted sessions', async () => {
    mockGetSessionById.mockResolvedValue(MOCK_SESSION_SUBMITTED);
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.queryByTestId('session-add-game-btn')).toBeNull();
    });
  });

  it('does NOT render Submit Session button for submitted sessions', async () => {
    mockGetSessionById.mockResolvedValue(MOCK_SESSION_SUBMITTED);
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.queryByTestId('session-submit-btn')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Invite banner
// ---------------------------------------------------------------------------

describe('SessionDetailScreen — invite banner', () => {
  it('shows invite banner when placeholder players exist', async () => {
    mockGetSessionById.mockResolvedValue(MOCK_SESSION_WITH_PLACEHOLDER);
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-invite-banner')).toBeTruthy();
    });
  });

  it('does NOT show invite banner when no placeholder players', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.queryByTestId('session-invite-banner')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// No games state
// ---------------------------------------------------------------------------

describe('SessionDetailScreen — no games', () => {
  it('renders no-games message when games list is empty', async () => {
    mockGetSessionById.mockResolvedValue(MOCK_SESSION_NO_GAMES);
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-no-games')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Menu button
// ---------------------------------------------------------------------------

describe('SessionDetailScreen — menu', () => {
  it('renders the menu button', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-menu-btn')).toBeTruthy();
    });
  });

  it('opens the bottom sheet when menu button is pressed', async () => {
    render(<SessionDetailRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-menu-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('session-menu-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('session-bottom-sheet')).toBeTruthy();
    });
  });
});
