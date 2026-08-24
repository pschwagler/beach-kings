/**
 * Tests for HomeScreen navigation behavior.
 * Focuses on the "View All" link in the Recent Games section.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockRefetchAll = jest.fn().mockResolvedValue(undefined);
const mockMakeQuery = <T,>(data: T, overrides: Record<string, unknown> = {}) => ({
  data,
  isPending: false,
  isFetching: false,
  isSuccess: true,
  isError: false,
  error: null,
  refetch: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});
let mockDashboardState: Record<string, unknown>;
const MOCK_STATS = {
  player_name: 'Ready Player',
  player_city: null,
  player_level: null,
  overall: {
    wins: 8, losses: 2, games_played: 10, rating: 1450,
    peak_rating: 1460, win_rate: 80, current_streak: 2, avg_point_diff: 3,
  },
  trophies: [], partners: [], opponents: [],
  elo_timeline: [
    { date: '2026-08-01', rating: 1440 },
    { date: '2026-08-20', rating: 1450 },
  ],
};

function resetDashboardState(): void {
  mockDashboardState = {
    player: mockMakeQuery({ id: 42, name: 'Ready Player', profile_picture_url: null }),
    leagues: mockMakeQuery([]),
    activeSession: mockMakeQuery(null),
    friendRequests: mockMakeQuery([]),
    courts: mockMakeQuery([]),
    matches: mockMakeQuery([
      {
        id: 1,
        partner_is_placeholder: false,
        opponent_1_is_placeholder: false,
        opponent_2_is_placeholder: false,
      },
    ]),
    stats: mockMakeQuery(MOCK_STATS),
    isInitialLoading: false,
    isRefreshing: false,
    refetchAll: mockRefetchAll,
  };
}

resetDashboardState();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Link = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const useRouter = () => ({ back: jest.fn(), replace: jest.fn(), push: mockPush });
  const useSegments = () => [];
  return { Link, useRouter, useSegments, useFocusEffect: jest.fn() };
});

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ brandTeal: '#2a7d9c' }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: () => ({ profileComplete: true }),
}));

jest.mock('@/features/notifications', () => ({
  __esModule: true,
  useNotifications: () => ({ unreadCount: 0, dmUnreadCount: 0 }),
}));

// useDashboard — non-loading state with one match so "View All" section renders
jest.mock('@/hooks/useDashboard', () => {
  return {
    __esModule: true,
    useDashboard: () => mockDashboardState,
  };
});

// SectionHeader: expose the onLinkPress via a testID-based Pressable
jest.mock('@/components/home/SectionHeader', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      linkLabel,
      onLinkPress,
    }: {
      title?: string;
      linkLabel?: string;
      onLinkPress?: () => void;
    }) => (
      <>
        <Text>{title}</Text>
        {linkLabel != null && onLinkPress != null ? (
          <Pressable
            testID={`view-all-${title ?? ''}`}
            accessibilityLabel={`${linkLabel} ${title ?? ''}`}
            onPress={onLinkPress}
          >
            <Text>{linkLabel}</Text>
          </Pressable>
        ) : null}
      </>
    ),
  };
});

jest.mock('@/components/home/HomeHeader', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text testID="home-header">Beach League</Text> };
});
jest.mock('@/components/home/QuickStatsRow', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/home/RecentGamesScroll', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/home/LeaguesScroll', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/home/CourtsScroll', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/home/DashboardSkeleton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="dashboard-skeleton" /> };
});
jest.mock('@/components/home/HomeSectionSkeleton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ label }: { label: string }) => (
      <View testID={`section-skeleton-${label}`} />
    ),
  };
});
jest.mock('@/components/home/SectionError', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ message, onRetry }: { message: string; onRetry: () => void }) => (
      <Pressable
        testID={`retry-${message}`}
        accessibilityRole="button"
        onPress={onRetry}
      >
        <Text>{message}</Text>
      </Pressable>
    ),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => (
      <View testID="safe-area-view">{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// ---------------------------------------------------------------------------

import HomeScreen, { resolveHomeLeadState } from '../../app/(tabs)/home';

describe('resolveHomeLeadState', () => {
  const profileDefaults = {
    profileComplete: false,
    profilePercent: 50,
  };
  const request = { sender_name: 'Avery' } as any;
  const session = { id: 8, name: 'Sunset Session' } as any;

  it('keeps cached active session first and marks refresh failure as stale', () => {
    expect(resolveHomeLeadState({
      ...profileDefaults,
      activeSession: session,
      activeSessionError: true,
      friendRequests: [request],
    })).toEqual({ kind: 'active-session', session, refreshFailed: true });
  });

  it('shows retry before lower-priority actions when session absence is unknown', () => {
    expect(resolveHomeLeadState({
      ...profileDefaults,
      activeSession: null,
      activeSessionError: true,
      friendRequests: [request],
    })).toEqual({ kind: 'active-session-error' });
  });

  it('prioritizes incoming friend requests over profile completion', () => {
    expect(resolveHomeLeadState({
      ...profileDefaults,
      activeSession: null,
      activeSessionError: false,
      friendRequests: [request],
    })).toEqual({ kind: 'friend-request', count: 1, senderName: 'Avery' });
  });

  it('uses profile completion then Record a Game as the final fallbacks', () => {
    expect(resolveHomeLeadState({
      ...profileDefaults,
      activeSession: null,
      activeSessionError: false,
      friendRequests: [],
    })).toEqual({ kind: 'profile', percent: 50 });
    expect(resolveHomeLeadState({
      ...profileDefaults,
      profileComplete: true,
      activeSession: null,
      activeSessionError: false,
      friendRequests: [],
    })).toEqual({ kind: 'record-game' });
  });
});

describe('HomeScreen navigation', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefetchAll.mockClear();
    resetDashboardState();
  });

  it('Recent Games "View All" navigates to /(stack)/my-games', () => {
    const { getByTestId } = render(<HomeScreen />);
    fireEvent.press(getByTestId('view-all-Recent Games'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/my-games');
  });

  it('opens My Stats from the Home widget before Courts', () => {
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('home-my-stats-widget'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/my-stats');

    const orderedSections = screen.UNSAFE_root.findAll(
      (node) => node.props.testID === 'home-my-stats-section' ||
        node.props.testID === 'home-courts-section',
    );
    expect([...new Set(orderedSections.map((node) => node.props.testID))]).toEqual([
      'home-my-stats-section',
      'home-courts-section',
    ]);
  });

  it('keeps cached stats visible when their refresh fails', () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    mockDashboardState = {
      ...mockDashboardState,
      stats: mockMakeQuery(MOCK_STATS, {
        isError: true,
        isSuccess: false,
        error: new Error('offline'),
        refetch: retry,
      }),
    };
    const screen = render(<HomeScreen />);
    expect(screen.getByText('1450')).toBeTruthy();
    fireEvent.press(screen.getByTestId('retry-Your stats may be out of date.'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('contains uncached stats loading and failure to the section', () => {
    mockDashboardState = {
      ...mockDashboardState,
      stats: mockMakeQuery(undefined, {
        isPending: true, isFetching: true, isSuccess: false,
      }),
    };
    const pending = render(<HomeScreen />);
    expect(pending.getByTestId('section-skeleton-my stats')).toBeTruthy();
    expect(pending.getByTestId('home-header')).toBeTruthy();
    pending.unmount();

    mockDashboardState = {
      ...mockDashboardState,
      stats: mockMakeQuery(undefined, {
        isPending: false, isError: true, isSuccess: false,
        error: new Error('offline'),
      }),
    };
    const failed = render(<HomeScreen />);
    expect(failed.getByText('Could not load your stats.')).toBeTruthy();
    expect(failed.getByTestId('home-header')).toBeTruthy();
  });

  it('shows a retryable offline state instead of a blank stats body', () => {
    mockDashboardState = {
      ...mockDashboardState,
      stats: mockMakeQuery(undefined, {
        isPending: true,
        isFetching: false,
        isSuccess: false,
      }),
    };
    const screen = render(<HomeScreen />);
    expect(screen.getByText('Stats are unavailable while offline.')).toBeTruthy();
    expect(screen.queryByTestId('section-skeleton-my stats')).toBeNull();
    expect(screen.getByTestId('home-header')).toBeTruthy();
  });

  it('keeps cached header content visible while independent sections load', () => {
    mockDashboardState = {
      ...mockDashboardState,
      leagues: mockMakeQuery(undefined, {
        isPending: true,
        isFetching: true,
        isSuccess: false,
      }),
      matches: mockMakeQuery(undefined, {
        isPending: true,
        isFetching: true,
        isSuccess: false,
      }),
      courts: mockMakeQuery(undefined, {
        isPending: true,
        isFetching: true,
        isSuccess: false,
      }),
    };

    const screen = render(<HomeScreen />);

    expect(screen.getByTestId('home-header')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-skeleton')).toBeNull();
    expect(screen.getByTestId('section-skeleton-recent games')).toBeTruthy();
    expect(screen.getByTestId('section-skeleton-leagues')).toBeTruthy();
    expect(screen.getByTestId('section-skeleton-nearby courts')).toBeTruthy();
  });

  it.each([
    ['matches', 'Could not load your recent games.'],
    ['leagues', 'Could not load your leagues.'],
    ['courts', 'Could not load nearby courts.'],
  ])('shows a retryable section error for %s without blanking Home', (section, message) => {
    mockDashboardState = {
      ...mockDashboardState,
      [section]: mockMakeQuery(undefined, {
        isError: true,
        isSuccess: false,
        error: new Error(`${section} failed`),
      }),
    };

    const screen = render(<HomeScreen />);

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByTestId('dashboard-skeleton')).toBeNull();
  });

  it('shows a bounded lead placeholder while friend requests load', () => {
    mockDashboardState = {
      ...mockDashboardState,
      friendRequests: mockMakeQuery(undefined, {
        isPending: true,
        isFetching: true,
        isSuccess: false,
      }),
    };

    const screen = render(<HomeScreen />);

    expect(screen.getByTestId('section-skeleton-next action')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-skeleton')).toBeNull();
  });

  it('shows a retryable lead error when friend requests fail', () => {
    mockDashboardState = {
      ...mockDashboardState,
      friendRequests: mockMakeQuery(undefined, {
        isError: true,
        isSuccess: false,
        error: new Error('friend requests failed'),
      }),
    };

    const screen = render(<HomeScreen />);

    expect(screen.getByText('Could not load friend requests.')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-skeleton')).toBeNull();
  });

  it('shows retryable dependency errors when an uncached player request fails', () => {
    const retryPlayer = jest.fn().mockResolvedValue(undefined);
    mockDashboardState = {
      ...mockDashboardState,
      player: mockMakeQuery(undefined, {
        isError: true,
        isSuccess: false,
        error: new Error('player unavailable'),
        refetch: retryPlayer,
      }),
      matches: mockMakeQuery(undefined, {
        isPending: true,
        isSuccess: false,
      }),
      courts: mockMakeQuery(undefined, {
        isPending: true,
        isSuccess: false,
      }),
    };

    const screen = render(<HomeScreen />);
    const gamesMessage =
      'Could not load recent games because your profile is unavailable.';
    const courtsMessage =
      'Could not load nearby courts because your profile is unavailable.';

    expect(screen.getByText(gamesMessage)).toBeTruthy();
    expect(screen.getByText(courtsMessage)).toBeTruthy();
    expect(screen.queryByTestId('dashboard-skeleton')).toBeNull();
    fireEvent.press(screen.getByTestId(`retry-${gamesMessage}`));
    expect(retryPlayer).toHaveBeenCalledTimes(1);
  });

  it('keeps content mounted during refresh', () => {
    mockDashboardState = {
      ...mockDashboardState,
      isRefreshing: true,
      isInitialLoading: false,
    };

    const screen = render(<HomeScreen />);

    expect(screen.queryByTestId('dashboard-skeleton')).toBeNull();
    expect(screen.getByTestId('home-scroll').props.refreshControl.props.refreshing).toBe(true);
  });
});
