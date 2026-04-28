/**
 * Behavior tests for the Find Players screen.
 *
 * Covers:
 *   - Loading skeleton while data is fetching
 *   - Error state with retry
 *   - Players list renders with player rows
 *   - Add friend button triggers api.sendFriendRequest and optimistic pending state
 *   - Tab switching between Players / Friends
 *   - Friends list renders friend rows
 *   - Friend request cards with Accept / Decline
 *   - Empty states
 *   - Search input filters players
 *   - Navigation to player profile on row press
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
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => <View testID="slot">{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
      <View testID={testID ?? 'safe-area-view'}>{children}</View>
    ),
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
  const Rect = () => null;
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
    Circle,
    Polygon,
    Rect,
  };
});

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

const mockDiscoverPlayers = jest.fn();
const mockGetFriends = jest.fn();
const mockGetFriendRequests = jest.fn();
const mockSendFriendRequest = jest.fn();
const mockAcceptFriendRequest = jest.fn();
const mockDeclineFriendRequest = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    discoverPlayers: (...args: unknown[]) => mockDiscoverPlayers(...args),
    getFriends: (...args: unknown[]) => mockGetFriends(...args),
    getFriendRequests: (...args: unknown[]) => mockGetFriendRequests(...args),
    sendFriendRequest: (...args: unknown[]) => mockSendFriendRequest(...args),
    acceptFriendRequest: (...args: unknown[]) => mockAcceptFriendRequest(...args),
    declineFriendRequest: (...args: unknown[]) => mockDeclineFriendRequest(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import FindPlayersRoute from '../../../app/(stack)/find-players';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PLAYERS = [
  {
    player_id: 20,
    full_name: 'Jordan Smith',
    avatar: null,
    city: 'San Diego',
    level: 'AA',
    games_played: 12,
    mutual_friends_count: 2,
    last_active_label: '2d ago',
    friend_status: 'none' as const,
  },
  {
    player_id: 21,
    full_name: 'Casey Lee',
    avatar: null,
    city: 'Los Angeles',
    level: 'Open',
    games_played: 5,
    mutual_friends_count: 0,
    last_active_label: '1w ago',
    friend_status: 'friend' as const,
  },
];

const MOCK_FRIENDS = {
  items: [
    {
      id: 1,
      player_id: 30,
      full_name: 'Morgan Davis',
      avatar: null,
      location_name: 'San Diego',
      level: 'A' as const,
    },
  ],
};

const MOCK_FRIEND_REQUESTS = {
  items: [
    {
      id: 100,
      sender_player_id: 50,
      sender_name: 'Riley Chen',
      sender_avatar: null,
      receiver_player_id: 0,
      receiver_name: 'Me',
      receiver_avatar: null,
      status: 'pending' as const,
      created_at: '2026-04-19T10:00:00Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockDiscoverPlayers.mockResolvedValue(MOCK_PLAYERS);
  mockGetFriends.mockResolvedValue(MOCK_FRIENDS);
  mockGetFriendRequests.mockResolvedValue(MOCK_FRIEND_REQUESTS);
  mockSendFriendRequest.mockResolvedValue({ status: 'ok' });
  mockAcceptFriendRequest.mockResolvedValue({ status: 'ok' });
  mockDeclineFriendRequest.mockResolvedValue({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('FindPlayersScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockDiscoverPlayers.mockReturnValue(new Promise(() => {}));
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('find-players-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('FindPlayersScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockDiscoverPlayers.mockRejectedValue(new Error('Network error'));
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('find-players-error-state')).toBeTruthy();
    });
  });

  it('renders retry button', async () => {
    mockDiscoverPlayers.mockRejectedValue(new Error('fail'));
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('find-players-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again on retry press', async () => {
    mockDiscoverPlayers.mockRejectedValueOnce(new Error('fail'));
    mockDiscoverPlayers.mockResolvedValue([]);
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('find-players-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('find-players-retry-btn'));
    await waitFor(() => {
      expect(mockDiscoverPlayers).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Players tab
// ---------------------------------------------------------------------------

describe('FindPlayersScreen — players tab', () => {
  it('renders the find-players screen', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('find-players-screen')).toBeTruthy();
    });
  });

  it('renders a player row for each player', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-row-20')).toBeTruthy();
      expect(screen.getByTestId('player-row-21')).toBeTruthy();
    });
  });

  it('renders Add button for player with friend_status=none', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('add-friend-btn-20')).toBeTruthy();
    });
  });

  it('renders Friends badge for player with friend_status=friend', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('friends-badge-21')).toBeTruthy();
    });
  });

  it('calls sendFriendRequest when Add is pressed', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('add-friend-btn-20')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('add-friend-btn-20'));
    await waitFor(() => {
      expect(mockSendFriendRequest).toHaveBeenCalledWith(20);
    });
  });

  it('shows Pending badge optimistically after Add is pressed', async () => {
    mockSendFriendRequest.mockReturnValue(new Promise(() => {})); // never resolves
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('add-friend-btn-20')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('add-friend-btn-20'));
    await waitFor(() => {
      expect(screen.getByTestId('pending-btn-20')).toBeTruthy();
    });
  });

  it('navigates to player profile when row is pressed', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('player-row-20')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('player-row-20'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(stack)/player/20');
    });
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('FindPlayersScreen — search', () => {
  it('renders search input', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('find-players-search-input')).toBeTruthy();
    });
  });

  it('filters players by name when search is typed', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('find-players-search-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('find-players-search-input'), 'Jordan');
    await waitFor(() => {
      expect(screen.getByTestId('player-row-20')).toBeTruthy();
      expect(screen.queryByTestId('player-row-21')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

describe('FindPlayersScreen — tabs', () => {
  it('renders both tab buttons', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-players')).toBeTruthy();
      expect(screen.getByTestId('tab-friends')).toBeTruthy();
    });
  });

  it('switches to friends tab and shows friends list', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-friends')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tab-friends'));
    await waitFor(() => {
      expect(screen.getByTestId('friends-list')).toBeTruthy();
    });
  });

  it('shows friend rows on friends tab', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-friends')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tab-friends'));
    await waitFor(() => {
      expect(screen.getByTestId('friend-row-30')).toBeTruthy();
    });
  });

  it('shows friend request card on friends tab', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-friends')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tab-friends'));
    await waitFor(() => {
      expect(screen.getByTestId('friend-request-card-100')).toBeTruthy();
    });
  });

  it('calls acceptFriendRequest when Accept is pressed', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-friends')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tab-friends'));
    await waitFor(() => {
      expect(screen.getByTestId('accept-request-btn-100')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('accept-request-btn-100'));
    });
    expect(mockAcceptFriendRequest).toHaveBeenCalledWith(100);
  });

  it('calls declineFriendRequest when Decline is pressed', async () => {
    render(<FindPlayersRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-friends')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tab-friends'));
    await waitFor(() => {
      expect(screen.getByTestId('decline-request-btn-100')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('decline-request-btn-100'));
    });
    expect(mockDeclineFriendRequest).toHaveBeenCalledWith(100);
  });
});
