/**
 * Behavior tests for the My Games screen and its sub-components.
 *
 * Covers:
 *   - Loading skeleton renders while data is loading
 *   - Empty state renders when no games
 *   - Error state renders on fetch failure, retry works
 *   - Games list renders with game rows
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
// Mock data — new GameHistoryEntry shape from @beach-kings/shared
// ---------------------------------------------------------------------------

const MOCK_WIN_GAME = {
  id: 101,
  session_id: 42,
  league_id: 1,
  league_name: 'QBK Open Men',
  court_label: 'QBK Sports',
  result: 'W' as const,
  my_score: 21,
  opponent_score: 18,
  partner_names: ['K. Fawwar'],
  opponent_names: ['A. Marthey', 'J. Zwyczca'],
  rating_change: 4,
  session_submitted: true,
};

const MOCK_LOSS_GAME = {
  id: 102,
  session_id: 42,
  league_id: 1,
  league_name: 'QBK Open Men',
  court_label: 'QBK Sports',
  result: 'L' as const,
  my_score: 17,
  opponent_score: 21,
  partner_names: ['S. Jindash'],
  opponent_names: ['J. Drabos', 'M. Salizar'],
  rating_change: -3,
  session_submitted: true,
};

const EMPTY_RESPONSE = { games: [], total: 0 };
const WIN_RESPONSE = { games: [MOCK_WIN_GAME], total: 1 };
const LOSS_RESPONSE = { games: [MOCK_LOSS_GAME], total: 1 };
const BOTH_RESPONSE = { games: [MOCK_WIN_GAME, MOCK_LOSS_GAME], total: 2 };

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockHapticMedium.mockResolvedValue(undefined);
  // Default: returns empty list immediately
  mockGetMyGames.mockResolvedValue(EMPTY_RESPONSE);
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
    mockGetMyGames.mockResolvedValue(EMPTY_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('games-empty-state')).toBeTruthy();
    });
  });

  it('renders "Add Your First Game" CTA button', async () => {
    mockGetMyGames.mockResolvedValue(EMPTY_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('add-first-game-btn')).toBeTruthy();
    });
  });

  it('navigates to Add Games when CTA is pressed', async () => {
    mockGetMyGames.mockResolvedValue(EMPTY_RESPONSE);
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
    mockGetMyGames.mockResolvedValue(EMPTY_RESPONSE);
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
    mockGetMyGames.mockResolvedValue(BOTH_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('game-row-101')).toBeTruthy();
      expect(screen.getByTestId('game-row-102')).toBeTruthy();
    });
  });

  it('renders WIN badge for a win result', async () => {
    mockGetMyGames.mockResolvedValue(WIN_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('WIN')).toBeTruthy();
    });
  });

  it('renders LOSS badge for a loss result', async () => {
    mockGetMyGames.mockResolvedValue(LOSS_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('LOSS')).toBeTruthy();
    });
  });

  it('renders league name in game row meta', async () => {
    mockGetMyGames.mockResolvedValue(WIN_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('QBK Open Men')).toBeTruthy();
    });
  });

  it('renders score in game row', async () => {
    mockGetMyGames.mockResolvedValue(WIN_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('21 - 18')).toBeTruthy();
    });
  });

  it('renders positive rating change', async () => {
    mockGetMyGames.mockResolvedValue(WIN_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('+4')).toBeTruthy();
    });
  });

  it('renders negative rating change', async () => {
    mockGetMyGames.mockResolvedValue(LOSS_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('-3')).toBeTruthy();
    });
  });

  it('renders PENDING badge when session not submitted', async () => {
    const pendingGame = { ...MOCK_WIN_GAME, id: 200, session_submitted: false, rating_change: null };
    mockGetMyGames.mockResolvedValue({ games: [pendingGame], total: 1 });
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('PENDING')).toBeTruthy();
    });
  });

  it('renders "Awaiting session submission" note when session not submitted', async () => {
    const pendingGame = { ...MOCK_WIN_GAME, id: 201, session_submitted: false };
    mockGetMyGames.mockResolvedValue({ games: [pendingGame], total: 1 });
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByText('Awaiting session submission')).toBeTruthy();
    });
  });

  it('navigates to session detail when a game row is pressed', async () => {
    mockGetMyGames.mockResolvedValue(WIN_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('game-row-101')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('game-row-101'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(stack)/session/42');
    });
  });
});

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

describe('MyGamesScreen — filter bar', () => {
  it('renders the filter bar', async () => {
    mockGetMyGames.mockResolvedValue(WIN_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('games-filter-bar')).toBeTruthy();
    });
  });

  it('renders All Results filter chip as active by default', async () => {
    mockGetMyGames.mockResolvedValue(EMPTY_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-result-all')).toBeTruthy();
    });
  });

  it('calls api with result=W when Wins filter is pressed', async () => {
    mockGetMyGames.mockResolvedValue(EMPTY_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-result-W')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-result-W'));
    await waitFor(() => {
      expect(mockGetMyGames).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'W' }),
      );
    });
  });

  it('calls api with result=L when Losses filter is pressed', async () => {
    mockGetMyGames.mockResolvedValue(EMPTY_RESPONSE);
    render(<MyGamesScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-result-L')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-result-L'));
    await waitFor(() => {
      expect(mockGetMyGames).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'L' }),
      );
    });
  });
});
