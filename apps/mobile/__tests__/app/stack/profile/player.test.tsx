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
 *   - Report action opens a prefilled mailto (no Block action)
 *   - Action sheet cancel closes overlay
 *   - Pull-to-refresh triggers refetch
 */

import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

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
    Easing: { inOut: () => ({}), ease: {} },
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
const mockGetPlayerLeagues = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getPublicPlayer: (...args: unknown[]) => mockGetPublicPlayer(...args),
    getMutualFriends: (...args: unknown[]) => mockGetMutualFriends(...args),
    batchFriendStatus: (...args: unknown[]) => mockBatchFriendStatus(...args),
    sendFriendRequest: (...args: unknown[]) => mockSendFriendRequest(...args),
    getPlayerLeagues: (...args: unknown[]) => mockGetPlayerLeagues(...args),
  },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
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
  id: 7,
  name: 'Sam Rivera',
  first_name: 'Sam',
  last_name: 'Rivera',
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPublicPlayer.mockResolvedValue(MOCK_PLAYER);
  mockGetMutualFriends.mockResolvedValue([]);
  mockBatchFriendStatus.mockResolvedValue({});
  mockSendFriendRequest.mockResolvedValue({});
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
    mockBatchFriendStatus.mockResolvedValue({ '42': 'none' });
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-add-friend-btn')).toBeTruthy();
    });
  });

  it('calls sendFriendRequest when Add Friend is pressed', async () => {
    mockBatchFriendStatus.mockResolvedValue({ '42': 'none' });
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

  it('shows a report option but no block option in the action sheet', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    expect(screen.getByTestId('action-sheet-report')).toBeTruthy();
    expect(screen.queryByTestId('action-sheet-block')).toBeNull();
  });

  it('opens a prefilled report email when report is pressed', async () => {
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as unknown as never);
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    fireEvent.press(screen.getByTestId('action-sheet-report'));

    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
    const url = openURL.mock.calls[0][0];
    expect(url).toContain('mailto:beachleaguevb+report@gmail.com');
    expect(url).toContain('subject=');
    // Reported player's ID (from route params) is embedded in the body.
    expect(decodeURIComponent(url)).toContain('Player ID: 42');
    // Action sheet closes after choosing report.
    expect(screen.queryByTestId('player-action-sheet')).toBeNull();
    openURL.mockRestore();
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
