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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
const mockSearchPlayers = jest.fn();
const mockInviteSessionPlayer = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#0D9488',
    textTertiary: '#999999',
  }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    removeSessionPlayer: (...args: unknown[]) => mockRemoveSessionPlayer(...args),
    searchPlayers: (...args: unknown[]) => mockSearchPlayers(...args),
    inviteSessionPlayer: (...args: unknown[]) => mockInviteSessionPlayer(...args),
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

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionRosterRoute />
    </QueryClientProvider>,
  );
}

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
  court_name: 'QBK Sports',
  court_id: null,
  session_type: 'league' as const,
  status: 'active' as const,
  players: [PLAYER_IN_GAMES, PLAYER_NO_GAMES],
};


const MOCK_SESSION_EMPTY = {
  ...MOCK_SESSION_WITH_PLAYERS,
  players: [],
};

const MOCK_SESSION_SUBMITTED = {
  ...MOCK_SESSION_WITH_PLAYERS,
  status: 'submitted' as const,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSessionById.mockResolvedValue(MOCK_SESSION_WITH_PLAYERS);
  mockRemoveSessionPlayer.mockResolvedValue(undefined);
  mockSearchPlayers.mockResolvedValue({
    items: [
      {
        id: 88,
        first_name: 'Jordan',
        last_name: 'Lee',
        full_name: 'Jordan Lee',
        nickname: null,
        initials: 'JL',
        tags: [],
        score: 10,
        in_session: false,
        is_guest: false,
      },
    ],
  });
  mockInviteSessionPlayer.mockResolvedValue({
    status: 'success',
    message: 'Player invited',
  });
});
// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('SessionRosterScreen — loading state', () => {
  it('renders loading indicator while fetching', async () => {
    mockGetSessionById.mockReturnValue(new Promise(() => {}));
    renderRoute();
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
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId('session-roster-screen')).toBeTruthy();
    });
  });

  it('renders close button', async () => {
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId('session-roster-close-btn')).toBeTruthy();
    });
  });

  it('renders subtitle bar with player count', async () => {
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId('roster-subtitle-bar')).toBeTruthy();
    });
  });

  it('renders player in games section row', async () => {
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId('roster-row-1')).toBeTruthy();
    });
  });

  it('renders player no games section row', async () => {
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId('roster-row-5')).toBeTruthy();
    });
  });

  it('renders add player button', async () => {
    renderRoute();
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
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId('roster-empty')).toBeTruthy();
    });
  });
});

describe('SessionRosterScreen — submitted session', () => {
  it('renders a read-only roster without mutation controls', async () => {
    mockGetSessionById.mockResolvedValue(MOCK_SESSION_SUBMITTED);
    renderRoute();

    await waitFor(() => {
      expect(screen.getByText('View Players')).toBeTruthy();
      expect(screen.getByTestId('roster-locked-message')).toBeTruthy();
    });
    expect(screen.queryByTestId('roster-add-player-btn')).toBeNull();
    expect(screen.queryByTestId('roster-remove-5')).toBeNull();
    expect(screen.getByTestId('roster-row-1')).toBeTruthy();
    expect(screen.getByTestId('roster-row-5')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Remove player
// ---------------------------------------------------------------------------

describe('SessionRosterScreen — remove player', () => {
  it('renders remove button only for players with no games', async () => {
    renderRoute();
    await waitFor(() => {
      // Player 5 has game_count=0 → can remove
      expect(screen.getByTestId('roster-remove-5')).toBeTruthy();
      // Player 1 has game_count=5 → cannot remove
    expect(screen.queryByTestId('roster-remove-1')).toBeNull();
    expect(screen.getByTestId('roster-remove-5').props.accessibilityRole).toBe(
      'button',
    );
    expect(screen.getByTestId('roster-remove-5').props.accessibilityLabel).toBe(
      'Remove C. Gulla from session',
    );
  });
  });

  it('calls api.removeSessionPlayer when remove button is pressed', async () => {
    renderRoute();
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
    renderRoute();
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
    renderRoute();
    await waitFor(() => {
      expect(screen.getByTestId('session-roster-close-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('session-roster-close-btn'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('opens the player picker and adds a selected player to the roster', async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByTestId('roster-add-player-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('roster-add-player-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('roster-add-player-modal')).toBeTruthy();
      expect(screen.getByTestId('roster-player-option-88')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('roster-player-option-88'));

    await waitFor(() =>
      expect(mockInviteSessionPlayer).toHaveBeenCalledWith(42, 88),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('roster-add-player-modal')).toBeNull(),
    );
    expect(mockGetSessionById.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('searches for other players within the current session and league', async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByTestId('roster-add-player-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('roster-add-player-btn'));
    await waitFor(() => expect(screen.getByTestId('roster-player-search')).toBeTruthy());

    fireEvent.changeText(
      screen.getByTestId('roster-player-search'),
      '  Jordan  ',
    );

    await waitFor(() => {
      expect(mockSearchPlayers).toHaveBeenCalledWith('Jordan', {
        sessionId: 42,
        leagueId: 1,
        limit: 50,
      });
    });
  });

  it('recovers when loading player options fails and the user retries', async () => {
    mockSearchPlayers
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({
        items: [
          {
            id: 88,
            first_name: 'Jordan',
            last_name: 'Lee',
            full_name: 'Jordan Lee',
            nickname: null,
            initials: 'JL',
            tags: [],
            score: 10,
            in_session: false,
            is_guest: false,
          },
        ],
      });
    renderRoute();
    await waitFor(() => expect(screen.getByTestId('roster-add-player-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('roster-add-player-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('roster-player-search-retry')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('roster-player-search-retry'));

    await waitFor(() =>
      expect(screen.getByTestId('roster-player-option-88')).toBeTruthy(),
    );
    expect(mockSearchPlayers).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'duplicate players',
      {
        response: {
          status: 400,
          data: { detail: 'Player is already a participant' },
        },
      },
      'already in the session',
    ],
    [
      'full sessions',
      {
        response: {
          status: 400,
          data: { detail: 'Session is full' },
        },
      },
      'session is full',
    ],
    ['offline failures', new Error('Network Error'), 'Check your connection'],
  ])('keeps the picker usable for %s', async (
    _label,
    error,
    expectedCopy,
  ) => {
    mockInviteSessionPlayer.mockRejectedValueOnce(error);
    renderRoute();
    await waitFor(() => expect(screen.getByTestId('roster-add-player-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('roster-add-player-btn'));
    await waitFor(() => expect(screen.getByTestId('roster-player-option-88')).toBeTruthy());
    fireEvent.press(screen.getByTestId('roster-player-option-88'));

    await waitFor(() =>
      expect(screen.getByTestId('roster-add-player-error')).toHaveTextContent(
        expectedCopy as string,
      ),
    );
    expect(screen.getByTestId('roster-add-player-modal')).toBeTruthy();
  });
});
