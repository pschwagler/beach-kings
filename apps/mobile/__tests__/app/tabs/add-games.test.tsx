/**
 * Behavior tests for the Add Games tab screen and its sub-components.
 *
 * Covers:
 *   - Chooser view: all tiles render, tapping each tile fires haptics and
 *     navigates to the correct route.
 *   - Active session banner renders and "Continue Session" navigates correctly.
 *   - League select view: loading skeleton, league list, empty state,
 *     error + retry, league row tap navigation.
 *
 * Mocks: @/lib/api, @/utils/haptics, expo-router, react-native-safe-area-context,
 *        react-native-reanimated (used by LoadingSkeleton), react-native-svg.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — all must be declared before any imports of the module under test
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    Slot: ({ children }: { children?: React.ReactNode }) => <View testID="slot">{children}</View>,
    Stack: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    Tabs: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    Link: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    SplashScreen: { preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() },
    useSegments: () => [],
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

// react-native-reanimated — skip animations in tests
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

// react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  const Circle = () => null;
  const G = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { __esModule: true, default: Svg, Svg, Path, Circle, G };
});

// Haptics
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/haptics', () => ({
  hapticMedium: () => mockHapticMedium(),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

// API mock
const mockGetActiveSession = jest.fn();
const mockGetUserLeagues = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getActiveSession: (...args: unknown[]) => mockGetActiveSession(...args),
    getUserLeagues: (...args: unknown[]) => mockGetUserLeagues(...args),
  },
}));

// Icons
jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) =>
    (_props: { size?: number; color?: string }) =>
      <View testID={`icon-${name}`} />;
  return {
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
    TrophyIcon: makeIcon('TrophyIcon'),
    AlertTriangleIcon: makeIcon('AlertTriangleIcon'),
    HomeIcon: makeIcon('HomeIcon'),
    PlusIcon: makeIcon('PlusIcon'),
    ChatIcon: makeIcon('ChatIcon'),
    UserIcon: makeIcon('UserIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import AddGamesScreen from '../../../app/(tabs)/add-games';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAddGames() {
  return render(<AddGamesScreen />);
}

const LEAGUE_1 = {
  id: 1,
  name: 'QBK Open Men - Mornings',
  location_name: "Queen's Beach, Waikiki",
  current_season: { name: 'Season 4' },
};

const LEAGUE_2 = {
  id: 2,
  name: 'South Bay Doubles',
  location_name: 'Manhattan Beach',
  current_season: null,
};

const ACTIVE_SESSION = {
  id: 42,
  season_id: 1,
  name: '3/19/2026 - Session #3',
  date: '2026-03-19',
  league_name: 'QBK Open Men - Mornings',
  status: 'open',
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockHapticMedium.mockResolvedValue(undefined);
  mockGetActiveSession.mockResolvedValue(null);
  mockGetUserLeagues.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Chooser view (no active session)
// ---------------------------------------------------------------------------

describe('AddGamesScreen — chooser view (no active session)', () => {
  it('renders the TopNav title "Add Games"', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByText('Add Games')).toBeTruthy();
    });
  });

  it('renders the description text when there is no active session', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(
        screen.getByText(/Record your beach volleyball games/i),
      ).toBeTruthy();
    });
  });

  it('renders the "What are you playing?" section label', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByText(/What are you playing\?/i)).toBeTruthy();
    });
  });

  it('renders the League Game tile', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
      expect(screen.getByText('League Game')).toBeTruthy();
    });
  });

  it('renders the Pickup Game tile', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-pickup-game')).toBeTruthy();
      expect(screen.getByText('Pickup Game')).toBeTruthy();
    });
  });

  it('renders League Game description text', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(
        screen.getByText('Record a game in one of your leagues'),
      ).toBeTruthy();
    });
  });

  it('renders Pickup Game description text', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(
        screen.getByText('Start a new session for casual play'),
      ).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Navigation: tile taps
// ---------------------------------------------------------------------------

describe('AddGamesScreen — tile navigation', () => {
  it('tapping Pickup Game calls hapticMedium', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-pickup-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-pickup-game'));
    await waitFor(() => {
      expect(mockHapticMedium).toHaveBeenCalled();
    });
  });

  it('tapping Pickup Game navigates to /(stack)/session/create', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-pickup-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-pickup-game'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(stack)/session/create');
    });
  });

  it('tapping League Game calls hapticMedium', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-league-game'));
    await waitFor(() => {
      expect(mockHapticMedium).toHaveBeenCalled();
    });
  });

  it('tapping League Game transitions to the league-select sub-view', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-league-game'));
    await waitFor(() => {
      expect(screen.getByText('Select League')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Active session banner
// ---------------------------------------------------------------------------

describe('AddGamesScreen — active session state', () => {
  beforeEach(() => {
    mockGetActiveSession.mockResolvedValue(ACTIVE_SESSION);
  });

  it('renders the Active Session banner', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByText('Active Session')).toBeTruthy();
    });
  });

  it('renders the active session name', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByText(ACTIVE_SESSION.name)).toBeTruthy();
    });
  });

  it('renders "Continue Session" button', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('continue-session-btn')).toBeTruthy();
    });
  });

  it('tapping Continue Session navigates to the session route', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('continue-session-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('continue-session-btn'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(`/(stack)/session/${ACTIVE_SESSION.id}`);
    });
  });

  it('renders "or start new" divider', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByText(/or start new/i)).toBeTruthy();
    });
  });

  it('still renders both game type tiles', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
      expect(screen.getByTestId('tile-pickup-game')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// League select sub-view
// ---------------------------------------------------------------------------

describe('AddGamesScreen — league select: loading state', () => {
  it('shows skeleton rows while leagues are loading', async () => {
    // Never resolves during the test
    mockGetUserLeagues.mockReturnValue(new Promise(() => undefined));
    renderAddGames();

    // Navigate to league-select view
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-league-game'));

    await waitFor(() => {
      expect(screen.getByTestId('league-list-loading')).toBeTruthy();
    });
  });
});

describe('AddGamesScreen — league select: leagues loaded', () => {
  beforeEach(() => {
    mockGetUserLeagues.mockResolvedValue([LEAGUE_1, LEAGUE_2]);
  });

  async function openLeagueSelect() {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-league-game'));
    await waitFor(() => {
      expect(screen.getByText('Select League')).toBeTruthy();
    });
  }

  it('renders the "Select League" title', async () => {
    await openLeagueSelect();
    expect(screen.getByText('Select League')).toBeTruthy();
  });

  it('renders both league names', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByText(LEAGUE_1.name)).toBeTruthy();
      expect(screen.getByText(LEAGUE_2.name)).toBeTruthy();
    });
  });

  it('renders the "Your Leagues" section label', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByText(/Your Leagues/i)).toBeTruthy();
    });
  });

  it('tapping a league row calls hapticMedium and navigates to create session', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByTestId(`league-row-${LEAGUE_1.id}`)).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId(`league-row-${LEAGUE_1.id}`));
    await waitFor(() => {
      expect(mockHapticMedium).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/(stack)/session/create');
    });
  });
});

describe('AddGamesScreen — league select: empty state', () => {
  beforeEach(() => {
    mockGetUserLeagues.mockResolvedValue([]);
  });

  async function openLeagueSelect() {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-league-game'));
    await waitFor(() => {
      expect(screen.getByText('Select League')).toBeTruthy();
    });
  }

  it('shows empty state message when user has no leagues', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByTestId('league-list-empty')).toBeTruthy();
    });
  });

  it('shows "Find Leagues" CTA in empty state', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByTestId('league-list-join-cta')).toBeTruthy();
    });
  });

  it('tapping "Find Leagues" navigates to find-leagues route', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByTestId('league-list-join-cta')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('league-list-join-cta'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(stack)/find-leagues');
    });
  });
});

describe('AddGamesScreen — league select: error + retry', () => {
  beforeEach(() => {
    mockGetUserLeagues.mockRejectedValue(new Error('Network error'));
  });

  async function openLeagueSelect() {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-league-game'));
    await waitFor(() => {
      expect(screen.getByText('Select League')).toBeTruthy();
    });
  }

  it('shows error state when leagues fetch fails', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByTestId('league-list-error')).toBeTruthy();
    });
  });

  it('shows error message text', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(
        screen.getByText(/Could not load your leagues/i),
      ).toBeTruthy();
    });
  });

  it('shows retry button in error state', async () => {
    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByTestId('league-list-retry')).toBeTruthy();
    });
  });

  it('tapping Retry re-fetches leagues', async () => {
    mockGetUserLeagues
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([LEAGUE_1]);

    await openLeagueSelect();
    await waitFor(() => {
      expect(screen.getByTestId('league-list-retry')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('league-list-retry'));
    await waitFor(() => {
      expect(mockGetUserLeagues).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Haptics on GameTypeCard
// ---------------------------------------------------------------------------

describe('GameTypeCard — haptic feedback', () => {
  it('fires hapticMedium when League Game tile is tapped', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-league-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-league-game'));
    await waitFor(() => {
      expect(mockHapticMedium).toHaveBeenCalledTimes(1);
    });
  });

  it('fires hapticMedium when Pickup Game tile is tapped', async () => {
    renderAddGames();
    await waitFor(() => {
      expect(screen.getByTestId('tile-pickup-game')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tile-pickup-game'));
    await waitFor(() => {
      expect(mockHapticMedium).toHaveBeenCalledTimes(1);
    });
  });
});
