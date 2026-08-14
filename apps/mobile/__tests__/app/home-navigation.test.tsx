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
  const makeQuery = <T,>(data: T) => ({
    data,
    isPending: false,
    isFetching: false,
    isSuccess: true,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
  });
  return {
    __esModule: true,
    useDashboard: () => ({
      player: makeQuery(null),
      leagues: makeQuery([]),
      activeSession: makeQuery(null),
      friendRequests: makeQuery([]),
      courts: makeQuery([]),
      // At least one match so isBrandNewUser === false and the section renders
      matches: makeQuery([
        {
          id: 1,
          partner_is_placeholder: false,
          opponent_1_is_placeholder: false,
          opponent_2_is_placeholder: false,
        },
      ]),
      isInitialLoading: false,
      isRefreshing: false,
      refetchAll: jest.fn().mockResolvedValue(undefined),
    }),
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
jest.mock('@/components/home/SectionError', () => ({ __esModule: true, default: () => null }));

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
  });

  it('Recent Games "View All" navigates to /(stack)/my-games', () => {
    const { getByTestId } = render(<HomeScreen />);
    fireEvent.press(getByTestId('view-all-Recent Games'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/my-games');
  });
});
