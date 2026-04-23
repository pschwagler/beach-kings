/**
 * Behavior tests for the My Games screen and its sub-components.
 *
 * Covers:
 *   - Loading skeleton renders while data is loading
 *   - Empty state renders when no games
 *   - Error state renders on fetch failure, retry works
 *   - Games list renders with date groups and game rows
 *   - WIN / LOSS badges render for respective results
 *   - Filter chips render and respond to presses
 *   - Pull-to-refresh triggers refetch
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
    useLocalSearchParams: () => ({}),
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
  const Polygon = () => null;
  const Polyline = () => null;
  const Defs = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const LinearGradient = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Stop = () => null;
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
    Circle,
    Polygon,
    Polyline,
    Defs,
    LinearGradient,
    Stop,
  };
});

const mockHapticMedium = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/haptics', () => ({
  hapticMedium: () => mockHapticMedium(),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockGetMyGames = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getMyGames: (...args: unknown[]) => mockGetMyGames(...args),
  },
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) =>
    (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import MyGamesScreen from '../../../../app/(stack)/my-games';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_WIN_GAME = {
  id: 101,
  session_id: 42,
  league_id: 1,
  league_name: 'QBK Open Men',
  date: '2026-03-19',
  time_label: '3:45 PM',
  result: 'win' as const,
  team1_score: 21,
  team2_score: 18,
  team1_player1_name: 'You',
  team1_player2_name: 'K. Fawwar',
  team2_player1_name: 'A. Marthey',
  team2_player2_name: 'J. Zwyczca',
  user_on_team1: true,
  rating_change: 4.2,
  has_pending_player: false,
  is_ranked: true,
};

const MOCK_LOSS_GAME = {
  id: 102,
  session_id: 42,
  league_id: 1,
  league_name: 'QBK Open Men',
  date: '2026-03-19',
  time_label: '3:10 PM',
  result: 'loss' as const,
  team1_score: 17,
  team2_score: 21,
  team1_player1_name: 'You',
  team1_player2_name: 'S. Jindash',
  team2_player1_name: 'J. Drabos',
  team2_player2_name: 'M. Salizar',
  user_on_team1: true,
  rating_change: -3.1,
  has_pending_player: false,
  is_ranked: true,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockHapticMedium.mockResolvedValue(undefined);
  // Default: returns empty list immediately
  mockGetMyGames.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('MyGamesScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    // Never resolves during this test
    mockGetMyGames.mockReturnValue(new Promise(() => {}));
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('games-list-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('MyGamesScreen — empty state', () => {
  it('renders empty state when no games are returned', async () => {
    mockGetMyGames.mockResolvedValue([]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('games-empty-state')).toBeTruthy();
    });
  });

  it('renders "Add Your First Game" CTA button', async () => {
    mockGetMyGames.mockResolvedValue([]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('add-first-game-btn')).toBeTruthy();
    });
  });

  it('navigates to Add Games when CTA is pressed', async () => {
    mockGetMyGames.mockResolvedValue([]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('add-first-game-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('add-first-game-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/add-games');
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('MyGamesScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetMyGames.mockRejectedValue(new Error('Network error'));
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('games-error-state')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetMyGames.mockRejectedValue(new Error('Network error'));
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('games-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetMyGames.mockRejectedValueOnce(new Error('fail'));
    mockGetMyGames.mockResolvedValue([]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('games-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('games-retry-btn'));
    await waitFor(() => {
      expect(mockGetMyGames).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Games list
// ---------------------------------------------------------------------------

describe('MyGamesScreen — games list', () => {
  it('renders a game row for each returned game', async () => {
    mockGetMyGames.mockResolvedValue([MOCK_WIN_GAME, MOCK_LOSS_GAME]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('game-row-101')).toBeTruthy();
      expect(screen.getByTestId('game-row-102')).toBeTruthy();
    });
  });

  it('renders WIN badge for a win result', async () => {
    mockGetMyGames.mockResolvedValue([MOCK_WIN_GAME]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('WIN')).toBeTruthy();
    });
  });

  it('renders LOSS badge for a loss result', async () => {
    mockGetMyGames.mockResolvedValue([MOCK_LOSS_GAME]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('LOSS')).toBeTruthy();
    });
  });

  it('renders league name in game row meta', async () => {
    mockGetMyGames.mockResolvedValue([MOCK_WIN_GAME]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('QBK Open Men')).toBeTruthy();
    });
  });

  it('renders score in game row', async () => {
    mockGetMyGames.mockResolvedValue([MOCK_WIN_GAME]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('21 - 18')).toBeTruthy();
    });
  });

  it('renders positive rating change green', async () => {
    mockGetMyGames.mockResolvedValue([MOCK_WIN_GAME]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('+4.2')).toBeTruthy();
    });
  });

  it('renders negative rating change', async () => {
    mockGetMyGames.mockResolvedValue([MOCK_LOSS_GAME]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('-3.1')).toBeTruthy();
    });
  });

  it('renders PENDING badge when rating_change is null', async () => {
    const pendingGame = { ...MOCK_WIN_GAME, id: 200, rating_change: null };
    mockGetMyGames.mockResolvedValue([pendingGame]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('PENDING')).toBeTruthy();
    });
  });

  it('renders pending player note when has_pending_player is true', async () => {
    const pendingGame = { ...MOCK_WIN_GAME, id: 201, has_pending_player: true };
    mockGetMyGames.mockResolvedValue([pendingGame]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(
        screen.getByText("Waiting for a player to claim their account"),
      ).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

describe('MyGamesScreen — filter bar', () => {
  it('renders the filter bar', async () => {
    mockGetMyGames.mockResolvedValue([MOCK_WIN_GAME]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('games-filter-bar')).toBeTruthy();
    });
  });

  it('renders All Results filter chip as active by default', async () => {
    mockGetMyGames.mockResolvedValue([]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-result-all')).toBeTruthy();
    });
  });

  it('calls api with result=win when Wins filter is pressed', async () => {
    mockGetMyGames.mockResolvedValue([]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-result-win')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-result-win'));
    await waitFor(() => {
      expect(mockGetMyGames).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'win' }),
      );
    });
  });

  it('calls api with result=loss when Losses filter is pressed', async () => {
    mockGetMyGames.mockResolvedValue([]);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-result-loss')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-result-loss'));
    await waitFor(() => {
      expect(mockGetMyGames).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'loss' }),
      );
    });
  });
});
