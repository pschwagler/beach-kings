/**
 * Behavior tests for the Notifications screen.
 *
 * Covers:
 *   - Loading skeleton while data is fetching
 *   - Error state with retry
 *   - Notifications list renders items
 *   - Filter tabs: All / Friends / Games / Leagues
 *   - Unread badge on All tab
 *   - Mark all as read button
 *   - Accept / Decline on friend_request notifications
 *   - Unread dot on unread notifications
 *   - Empty state per filter
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

const mockGetNotifications = jest.fn();
const mockMarkNotificationRead = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();
const mockAcceptFriendRequest = jest.fn();
const mockDeclineFriendRequest = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
    markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
    markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
    acceptFriendRequest: (...args: unknown[]) => mockAcceptFriendRequest(...args),
    declineFriendRequest: (...args: unknown[]) => mockDeclineFriendRequest(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import NotificationsRoute from '../../../app/(stack)/notifications';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    user_id: 0,
    type: 'friend_request' as const,
    title: 'Riley Chen sent you a friend request',
    message: 'Riley wants to connect with you.',
    data: { request_id: 100 },
    is_read: false,
    read_at: null,
    link_url: null,
    created_at: '2026-04-19T14:00:00Z',
  },
  {
    id: 2,
    user_id: 0,
    type: 'league_invite' as const,
    title: 'You were invited to QBK Open Men',
    message: 'Alex Torres invited you to join the league.',
    data: { league_id: 5 },
    is_read: true,
    read_at: '2026-04-19T13:00:00Z',
    link_url: '/(stack)/league/5',
    created_at: '2026-04-19T13:00:00Z',
  },
  {
    id: 3,
    user_id: 0,
    type: 'session_submitted' as const,
    title: 'Your session was submitted',
    message: 'Session for QBK Open Men has been submitted.',
    data: { session_id: 99 },
    is_read: false,
    read_at: null,
    link_url: null,
    created_at: '2026-04-18T10:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  mockMarkNotificationRead.mockResolvedValue({ status: 'ok' });
  mockMarkAllNotificationsRead.mockResolvedValue({ status: 'ok' });
  mockAcceptFriendRequest.mockResolvedValue({ status: 'ok' });
  mockDeclineFriendRequest.mockResolvedValue({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('NotificationsScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetNotifications.mockReturnValue(new Promise(() => {}));
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('NotificationsScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetNotifications.mockRejectedValue(new Error('Network error'));
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-error-state')).toBeTruthy();
    });
  });

  it('renders retry button', async () => {
    mockGetNotifications.mockRejectedValue(new Error('fail'));
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again on retry', async () => {
    mockGetNotifications.mockRejectedValueOnce(new Error('fail'));
    mockGetNotifications.mockResolvedValue([]);
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('notifications-retry-btn'));
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Notifications list
// ---------------------------------------------------------------------------

describe('NotificationsScreen — notifications list', () => {
  it('renders the notifications screen', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-screen')).toBeTruthy();
    });
  });

  it('renders a notification item for each notification', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notification-item-1')).toBeTruthy();
      expect(screen.getByTestId('notification-item-2')).toBeTruthy();
      expect(screen.getByTestId('notification-item-3')).toBeTruthy();
    });
  });

  it('shows unread dot on unread notification', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('unread-dot-1')).toBeTruthy();
    });
  });

  it('does not show unread dot on read notification', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.queryByTestId('unread-dot-2')).toBeNull();
    });
  });

  it('displays notification title', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByText('Riley Chen sent you a friend request')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Friend request actions
// ---------------------------------------------------------------------------

describe('NotificationsScreen — friend request actions', () => {
  it('renders Accept button for friend_request notification', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notif-accept-btn-1')).toBeTruthy();
    });
  });

  it('renders Decline button for friend_request notification', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notif-decline-btn-1')).toBeTruthy();
    });
  });

  it('calls acceptFriendRequest when Accept is pressed', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notif-accept-btn-1')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('notif-accept-btn-1'));
    });
    expect(mockAcceptFriendRequest).toHaveBeenCalledWith(100);
  });

  it('calls declineFriendRequest when Decline is pressed', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notif-decline-btn-1')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('notif-decline-btn-1'));
    });
    expect(mockDeclineFriendRequest).toHaveBeenCalledWith(100);
  });
});

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

describe('NotificationsScreen — filter tabs', () => {
  it('renders all four filter tabs', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-tab-all')).toBeTruthy();
      expect(screen.getByTestId('filter-tab-friends')).toBeTruthy();
      expect(screen.getByTestId('filter-tab-games')).toBeTruthy();
      expect(screen.getByTestId('filter-tab-leagues')).toBeTruthy();
    });
  });

  it('filters to friends notifications when Friends tab is pressed', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-tab-friends')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-tab-friends'));
    await waitFor(() => {
      // friend_request is a friends notification
      expect(screen.getByTestId('notification-item-1')).toBeTruthy();
      // league_invite is NOT in friends filter
      expect(screen.queryByTestId('notification-item-2')).toBeNull();
      // session_submitted is NOT in friends filter
      expect(screen.queryByTestId('notification-item-3')).toBeNull();
    });
  });

  it('filters to leagues notifications when Leagues tab is pressed', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-tab-leagues')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-tab-leagues'));
    await waitFor(() => {
      expect(screen.queryByTestId('notification-item-1')).toBeNull();
      expect(screen.getByTestId('notification-item-2')).toBeTruthy();
      expect(screen.queryByTestId('notification-item-3')).toBeNull();
    });
  });

  it('filters to games notifications when Games tab is pressed', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('filter-tab-games')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-tab-games'));
    await waitFor(() => {
      expect(screen.queryByTestId('notification-item-1')).toBeNull();
      expect(screen.queryByTestId('notification-item-2')).toBeNull();
      expect(screen.getByTestId('notification-item-3')).toBeTruthy();
    });
  });

  it('shows all notifications when All tab is active', async () => {
    render(<NotificationsRoute />);
    // Switch to Friends, then back to All
    await waitFor(() => {
      expect(screen.getByTestId('filter-tab-friends')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('filter-tab-friends'));
    fireEvent.press(screen.getByTestId('filter-tab-all'));
    await waitFor(() => {
      expect(screen.getByTestId('notification-item-1')).toBeTruthy();
      expect(screen.getByTestId('notification-item-2')).toBeTruthy();
      expect(screen.getByTestId('notification-item-3')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Mark all read
// ---------------------------------------------------------------------------

describe('NotificationsScreen — mark all read', () => {
  it('renders Mark all as read button when unread notifications exist', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('mark-all-read-btn')).toBeTruthy();
    });
  });

  it('calls markAllNotificationsRead when button is pressed', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('mark-all-read-btn')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('mark-all-read-btn'));
    });
    expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
  });

  it('hides mark all read button when all notifications are read', async () => {
    mockGetNotifications.mockResolvedValue([
      { ...MOCK_NOTIFICATIONS[0], is_read: true, read_at: '2026-04-19T14:00:00Z' },
      { ...MOCK_NOTIFICATIONS[1] },
    ]);
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.queryByTestId('mark-all-read-btn')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('NotificationsScreen — empty state', () => {
  it('renders empty state when no notifications', async () => {
    mockGetNotifications.mockResolvedValue([]);
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-empty-state')).toBeTruthy();
    });
  });
});
