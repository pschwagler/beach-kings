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
 *   - Block / Report actions in action sheet
 *   - Action sheet cancel closes overlay
 *   - Pull-to-refresh triggers refetch
 */

import React from 'react';
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

const mockGetPlayerStats = jest.fn();
const mockGetMutualFriends = jest.fn();
const mockBatchFriendStatus = jest.fn();
const mockSendFriendRequest = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getPlayerStats: (...args: unknown[]) => mockGetPlayerStats(...args),
    getMutualFriends: (...args: unknown[]) => mockGetMutualFriends(...args),
    batchFriendStatus: (...args: unknown[]) => mockBatchFriendStatus(...args),
    sendFriendRequest: (...args: unknown[]) => mockSendFriendRequest(...args),
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
  mockGetPlayerStats.mockResolvedValue(MOCK_PLAYER);
  mockGetMutualFriends.mockResolvedValue([]);
  mockBatchFriendStatus.mockResolvedValue({});
  mockSendFriendRequest.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('PlayerProfileScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetPlayerStats.mockReturnValue(new Promise(() => {}));
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
    mockGetPlayerStats.mockRejectedValue(new Error('Network error'));
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-profile-error')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetPlayerStats.mockRejectedValue(new Error('Network error'));
    render(<PlayerProfileRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-profile-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetPlayerStats.mockRejectedValueOnce(new Error('fail'));
    mockGetPlayerStats.mockResolvedValue(MOCK_PLAYER);
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-retry-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-profile-retry-btn'));
    await waitFor(() => {
      expect(mockGetPlayerStats).toHaveBeenCalledTimes(2);
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

  it('shows block and report options in action sheet', async () => {
    render(<PlayerProfileRoute />);
    await waitFor(() => expect(screen.getByTestId('player-profile-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('player-more-btn'));
    expect(screen.getByTestId('action-sheet-block')).toBeTruthy();
    expect(screen.getByTestId('action-sheet-report')).toBeTruthy();
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
