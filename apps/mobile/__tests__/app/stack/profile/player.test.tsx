/**
 * Behavior tests for the Player Profile screen.
 *
 * Covers:
 *   - Loading skeleton while data is fetching
 *   - Error state on fetch failure + retry
 *   - Profile header renders player name
 *   - Stats grid renders with data
 *   - Mutual friends strip renders
 *   - Add Friend button triggers API call
 *   - Message button navigates to messages
 *   - More (•••) button opens action sheet
 *   - Report and Block actions use the in-app safety flow
 *   - Action sheet cancel closes overlay
 *   - Pull-to-refresh triggers refetch
 */

import React from 'react';
import { Alert } from 'react-native';
import type { AlertButton } from 'react-native';
import {
  render as renderWithTestingLibrary,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    useLocalSearchParams: () => ({ id: '42' }),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
      <View testID={testID ?? 'safe-area-view'}>{children}</View>,
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
    Easing: { inOut: () => ({}), in: () => ({}), out: () => ({}), cubic: {} },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  const Circle = () => null;
  return { __esModule: true, default: Svg, Svg, Path, Circle };
});

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockGetPublicPlayer = jest.fn();
const mockGetMutualFriends = jest.fn();
const mockBatchFriendStatus = jest.fn();
const mockSendFriendRequest = jest.fn();
const mockRemoveFriend = jest.fn();
const mockGetPlayerLeagues = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getPublicPlayer: (...args: unknown[]) => mockGetPublicPlayer(...args),
    getMutualFriends: (...args: unknown[]) => mockGetMutualFriends(...args),
    batchFriendStatus: (...args: unknown[]) => mockBatchFriendStatus(...args),
    sendFriendRequest: (...args: unknown[]) => mockSendFriendRequest(...args),
    removeFriend: (...args: unknown[]) => mockRemoveFriend(...args),
    getPlayerLeagues: (...args: unknown[]) => mockGetPlayerLeagues(...args),
    getBlockedPlayers: jest.fn().mockResolvedValue([]),
    blockPlayer: jest.fn().mockResolvedValue({ player_id: 42, status: 'blocked' }),
    unblockPlayer: jest.fn().mockResolvedValue({ player_id: 42, status: 'unblocked' }),
    getInteractionCapabilities: jest.fn().mockResolvedValue({
      capabilities: {
        '42': {
          actions: {
            direct_message: true,
            friend_request: true,
            league_invite: true,
            session_invite: true,
            mention: true,
            reply: true,
            presence: true,
            read_receipt: true,
            notification: true,
            discovery: true,
            shared_operational_content: true,
          },
          blocked_by_viewer: false,
          viewer_restricted: false,
        },
      },
    }),
    reportContent: jest.fn(),
  },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1 },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
    EyeIcon: makeIcon('EyeIcon'),
    EyeOffIcon: makeIcon('EyeOffIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import PlayerProfileRoute from '../../../../app/(stack)/player/[id]';

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const view = renderWithTestingLibrary(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
  return { ...view, queryClient };
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PLAYER = {
  id: 42,
  name: 'Alex Torres',
  first_name: 'Alex',
  last_name: 'Torres',
  city: 'San Diego',
  state: 'CA',
  level: 'AA',
  wins: 30,
  losses: 10,
  rating: 1420,
  total_games: 40,
  win_percentage: 75,
};

const MOCK_MUTUAL_FRIEND = {
  player_id: 7,
  full_name: 'Sam Rivera',
  avatar: null,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPublicPlayer.mockResolvedValue(MOCK_PLAYER);
  mockGetMutualFriends.mockResolvedValue([]);
  mockBatchFriendStatus.mockResolvedValue({
    statuses: { '42': 'none' },
    relationships: { '42': { status: 'none', request_id: null } },
    mutual_counts: { '42': 0 },
  });
  mockSendFriendRequest.mockResolvedValue({});
  mockRemoveFriend.mockResolvedValue({});
  mockGetPlayerLeagues.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('PlayerProfileScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetPublicPlayer.mockReturnValue(new Promise(() => {}));
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-profile-skeleton')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('PlayerProfileScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetPublicPlayer.mockRejectedValue(new Error('Network error'));
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-profile-error')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetPublicPlayer.mockRejectedValue(new Error('Network error'));
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-profile-retry-btn')).toBeTruthy();
    });
  });

  it('renders not-available copy without retry when the public profile 404s', async () => {
    const notFoundError = Object.assign(new Error('Request failed with status code 404'), {
      response: { status: 404 },
    });
    mockGetPublicPlayer.mockRejectedValue(notFoundError);

    render(<PlayerProfileRoute />);

    await waitFor(() => {
      expect(screen.getByText('Profile not available')).toBeTruthy();
      expect(screen.getByText("This player's profile isn't available yet.")).toBeTruthy();
    });
    expect(screen.queryByTestId('player-profile-retry-btn')).toBeNull();
    expect(screen.queryByText('Check your connection and try again.')).toBeNull();
  });

  it('calls api again when retry is pressed', async () => {
    mockGetPublicPlayer.mockRejectedValueOnce(new Error('fail'));
    mockGetPublicPlayer.mockResolvedValue(MOCK_PLAYER);
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-retry-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-profile-retry-btn'));
    await waitFor(() => {
      expect(mockGetPublicPlayer).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Profile header
// ---------------------------------------------------------------------------

describe('PlayerProfileScreen — profile header', () => {
  it('renders player name in header', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-profile-name')).toBeTruthy();
    });
    expect(screen.getByText('Alex Torres')).toBeTruthy();
  });

  it('renders Add Friend button when status is none', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '42': 'none' },
      relationships: { '42': { status: 'none', request_id: null } },
      mutual_counts: { '42': 0 },
    });
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-add-friend-btn')).toBeTruthy();
    });
  });

  it('calls sendFriendRequest when Add Friend is pressed', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '42': 'none' },
      relationships: { '42': { status: 'none', request_id: null } },
      mutual_counts: { '42': 0 },
    });
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-add-friend-btn')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('player-add-friend-btn'));
    });
    await waitFor(() => {
      expect(mockSendFriendRequest).toHaveBeenCalledWith(42);
    });
  });

  it('renders Message button', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-message-btn')).toBeTruthy();
    });
  });

  it('navigates to messages when Message is pressed', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-message-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-message-btn'));
    expect(mockPush).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stats grid
// ---------------------------------------------------------------------------

describe('PlayerProfileScreen — stats grid', () => {
  it('renders stats grid after data loads', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-stats-grid')).toBeTruthy();
    });
  });

  it('renders win rate stat', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('stat-win-rate')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Mutual friends
// ---------------------------------------------------------------------------

describe('PlayerProfileScreen — mutual friends', () => {
  it('renders mutual friends section when friends exist', async () => {
    mockGetMutualFriends.mockResolvedValue([MOCK_MUTUAL_FRIEND]);
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-mutual-friends')).toBeTruthy();
    });
  });

  it('does not render mutual friends section when empty', async () => {
    mockGetMutualFriends.mockResolvedValue([]);
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.queryByTestId('player-mutual-friends')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Action sheet
// ---------------------------------------------------------------------------

describe('PlayerProfileScreen — action sheet', () => {
  it('opens action sheet when more button is pressed', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    expect(screen.getByTestId('player-action-sheet')).toBeTruthy();
  });

  it('shows report and block options in the action sheet', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    expect(screen.getByTestId('action-sheet-report')).toBeTruthy();
    expect(screen.getByTestId('action-sheet-block')).toBeTruthy();
  });

  it('confirms and removes an accepted friend through the shared API', async () => {
    mockBatchFriendStatus.mockResolvedValue({
      statuses: { '42': 'friend' },
      relationships: { '42': { status: 'friend', request_id: null } },
      mutual_counts: { '42': 0 },
    });
    let alertButtons: AlertButton[] = [];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(
      (_title, _message, buttons) => {
        alertButtons = buttons ?? [];
      },
    );

    const { queryClient } = render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByText('Friends')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    fireEvent.press(screen.getByTestId('action-sheet-remove-friend'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Remove Friend',
      expect.stringContaining('Alex Torres'),
      expect.any(Array),
    );
    await act(async () => {
      alertButtons.find((button) => button.text === 'Remove')?.onPress?.();
    });
    await waitFor(() => expect(mockRemoveFriend).toHaveBeenCalledWith(42));
    await waitFor(() => {
      expect(queryClient.isMutating() + queryClient.isFetching()).toBe(0);
    });
    alert.mockRestore();
  });

  it('does not offer friend removal for a non-friend', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    expect(screen.queryByTestId('action-sheet-remove-friend')).toBeNull();
  });

  it('opens the in-app report flow when report is pressed', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    fireEvent.press(screen.getByTestId('action-sheet-report'));

    expect(screen.getByText('Choose the reason that best describes the problem.')).toBeTruthy();
    expect(screen.getByText('Harassment or bullying')).toBeTruthy();
    // Action sheet closes after choosing report.
    expect(screen.queryByTestId('player-action-sheet')).toBeNull();
  });

  it('closes action sheet when cancel is pressed', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    expect(screen.getByTestId('player-action-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('action-sheet-cancel'));
    expect(screen.queryByTestId('player-action-sheet')).toBeNull();
  });
});
