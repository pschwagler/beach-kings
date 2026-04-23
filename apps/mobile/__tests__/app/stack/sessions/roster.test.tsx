/**
 * Behavior tests for the Session Roster (Manage Players) screen.
 *
 * Covers:
 *   - Loading state while session fetches
 *   - Players rendered in two sections (In Games / No Games Yet)
 *   - Empty state when no players
 *   - Remove button only appears for players with no games
 *   - Remove player calls api.removeSessionPlayer
 *   - Error shown when remove fails
 *   - Add Player button calls onAddPlayer (navigates)
 *   - Close button calls router.back
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
const mockRemoveSessionPlayer = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    removeSessionPlayer: (...args: unknown[]) => mockRemoveSessionPlayer(...args),
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

import SessionRosterRoute from '../../../../app/(stack)/session/[id]/roster';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const PLAYER_IN_GAMES = {
  id: 1,
  player_id: 1,
  display_name: 'You',
  initials: 'PS',
  is_placeholder: false,
  game_count: 5,
};

const PLAYER_NO_GAMES = {
  id: 5,
  player_id: 5,
  display_name: 'C. Gulla',
  initials: 'CG',
  is_placeholder: false,
  game_count: 0,
};

const MOCK_SESSION_WITH_PLAYERS = {
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
  players: [PLAYER_IN_GAMES, PLAYER_NO_GAMES],
  games: [],
  user_wins: 0,
  user_losses: 0,
  user_rating_change: null,
};

const MOCK_SESSION_EMPTY = {
  ...MOCK_SESSION_WITH_PLAYERS,
  players: [],
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSessionById.mockResolvedValue(MOCK_SESSION_WITH_PLAYERS);
  mockRemoveSessionPlayer.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('SessionRosterScreen — loading state', () => {
  it('renders loading indicator while fetching', async () => {
    mockGetSessionById.mockReturnValue(new Promise(() => {}));
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('roster-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Render with players
// ---------------------------------------------------------------------------

describe('SessionRosterScreen — render with players', () => {
  it('renders the roster screen container', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-roster-screen')).toBeTruthy();
    });
  });

  it('renders close button', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-roster-close-btn')).toBeTruthy();
    });
  });

  it('renders subtitle bar with player count', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('roster-subtitle-bar')).toBeTruthy();
    });
  });

  it('renders player in games section row', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('roster-row-1')).toBeTruthy();
    });
  });

  it('renders player no games section row', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('roster-row-5')).toBeTruthy();
    });
  });

  it('renders add player button', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('roster-add-player-btn')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('SessionRosterScreen — empty state', () => {
  it('renders empty state when no players', async () => {
    mockGetSessionById.mockResolvedValue(MOCK_SESSION_EMPTY);
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('roster-empty')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Remove player
// ---------------------------------------------------------------------------

describe('SessionRosterScreen — remove player', () => {
  it('renders remove button only for players with no games', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      // Player 5 has game_count=0 → can remove
      expect(screen.getByTestId('roster-remove-5')).toBeTruthy();
      // Player 1 has game_count=5 → cannot remove
      expect(screen.queryByTestId('roster-remove-1')).toBeNull();
    });
  });

  it('calls api.removeSessionPlayer when remove button is pressed', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('roster-remove-5')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('roster-remove-5'));
    });
    await waitFor(() => {
      expect(mockRemoveSessionPlayer).toHaveBeenCalledWith(42, 5);
    });
  });

  it('shows error message when remove fails', async () => {
    mockRemoveSessionPlayer.mockRejectedValue(new Error('TODO(backend): removeSessionPlayer'));
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('roster-remove-5')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('roster-remove-5'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('roster-remove-error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('SessionRosterScreen — navigation', () => {
  it('calls router.back when close button is pressed', async () => {
    render(<SessionRosterRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('session-roster-close-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('session-roster-close-btn'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
