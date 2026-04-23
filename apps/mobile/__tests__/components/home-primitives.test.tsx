/**
 * Tests for the simple home dashboard primitives: HomeHeader, QuickStatsRow,
 * SectionHeader, SectionError, PendingInvitesBanner, ProfileBanner,
 * NewUserWelcome, TournamentsEmpty, and DashboardSkeleton.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Router mock — fresh jest.fn per describe via beforeEach.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

// Icon stubs — every imported icon resolves to a simple View with a testID.
jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub =
    (name: string) =>
    ({ size, color }: { size?: number; color?: string }) => (
      <View testID={`icon-${name}`} />
    );
  return {
    CrownIcon: stub('Crown'),
    ChatIcon: stub('Chat'),
    BellIcon: stub('Bell'),
    UsersIcon: stub('Users'),
    XIcon: stub('X'),
    ChevronRightIcon: stub('ChevronRight'),
  };
});

// Avatar stub — just renders the name for reflection.
jest.mock('@/components/ui/Avatar', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function Avatar({ name }: { name: string }) {
    return <Text testID="avatar">{name}</Text>;
  };
});

// react-native-svg stub used by ProfileBanner — swap to plain Views so we
// don't need the real native deps in jest-dom.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );
  return { __esModule: true, default: Stub, Svg: Stub, Circle: Stub };
});

// LoadingSkeleton stub — renders a plain View with its className for DashboardSkeleton.
jest.mock('@/components/ui/LoadingSkeleton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function LoadingSkeleton() {
    return <View testID="loading-skeleton" />;
  };
});

import HomeHeader from '@/components/home/HomeHeader';
import QuickStatsRow from '@/components/home/QuickStatsRow';
import SectionHeader from '@/components/home/SectionHeader';
import SectionError from '@/components/home/SectionError';
import PendingInvitesBanner from '@/components/home/PendingInvitesBanner';
import ProfileBanner from '@/components/home/ProfileBanner';
import NewUserWelcome from '@/components/home/NewUserWelcome';
import TournamentsEmpty from '@/components/home/TournamentsEmpty';
import DashboardSkeleton from '@/components/home/DashboardSkeleton';

beforeEach(() => {
  mockPush.mockClear();
});

// ---------------------------------------------------------------------------
// HomeHeader
// ---------------------------------------------------------------------------
describe('HomeHeader', () => {
  it('renders the brand wordmark + avatar', () => {
    const { getByText, getByTestId } = render(
      <HomeHeader
        userName="Ava"
        avatarUrl={null}
        dmUnreadCount={0}
        notificationUnreadCount={0}
      />,
    );
    expect(getByText('BEACH LEAGUE')).toBeTruthy();
    expect(getByTestId('avatar')).toBeTruthy();
  });

  it('hides badges when unread counts are zero', () => {
    const { queryByText } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={0}
        notificationUnreadCount={0}
      />,
    );
    expect(queryByText('0')).toBeNull();
  });

  it('shows unread counts on both badges', () => {
    const { getByText } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={3}
        notificationUnreadCount={5}
      />,
    );
    expect(getByText('3')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
  });

  it('clamps counts above 99 to 99+', () => {
    const { getByText } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={120}
        notificationUnreadCount={0}
      />,
    );
    expect(getByText('99+')).toBeTruthy();
  });

  it('navigates when each icon button is pressed', () => {
    const { getByLabelText } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={2}
        notificationUnreadCount={0}
      />,
    );
    fireEvent.press(getByLabelText('Messages, 2 unread'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/messages');

    fireEvent.press(getByLabelText('Notifications'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/notifications');

    fireEvent.press(getByLabelText('My profile'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/profile');
  });
});

// ---------------------------------------------------------------------------
// QuickStatsRow
// ---------------------------------------------------------------------------
describe('QuickStatsRow', () => {
  it('renders greeting and win/loss pill even without a rating', () => {
    const { getByText, queryByText } = render(
      <QuickStatsRow firstName="Ben" rating={null} wins={4} losses={2} />,
    );
    expect(getByText('Hey Ben')).toBeTruthy();
    // No rating pill when rating is null.
    expect(queryByText(/Rating/)).toBeNull();
    expect(getByText('4-2')).toBeTruthy();
  });

  it('renders the rating pill when rating is a number', () => {
    const { getByText } = render(
      <QuickStatsRow firstName="Ben" rating={1450} wins={0} losses={0} />,
    );
    expect(getByText('1,450')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------
describe('SectionHeader', () => {
  it('renders only the title when no link is provided', () => {
    const { getByText, queryByRole } = render(<SectionHeader title="Leagues" />);
    expect(getByText('Leagues')).toBeTruthy();
    expect(queryByRole('link')).toBeNull();
  });

  it('renders a pressable link when linkLabel + onLinkPress are provided', () => {
    const onLinkPress = jest.fn();
    const { getByRole } = render(
      <SectionHeader title="Leagues" linkLabel="See all" onLinkPress={onLinkPress} />,
    );
    fireEvent.press(getByRole('link'));
    expect(onLinkPress).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SectionError
// ---------------------------------------------------------------------------
describe('SectionError', () => {
  it('uses a default message when none supplied', () => {
    const { getByText } = render(<SectionError />);
    expect(getByText('Could not load this section.')).toBeTruthy();
  });

  it('renders a retry button that fires onRetry', () => {
    const onRetry = jest.fn();
    const { getByLabelText } = render(
      <SectionError message="Games failed" onRetry={onRetry} />,
    );
    fireEvent.press(getByLabelText('Retry loading this section'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('hides the retry button when no onRetry is passed', () => {
    const { queryByLabelText } = render(<SectionError message="x" />);
    expect(queryByLabelText('Retry loading this section')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PendingInvitesBanner
// ---------------------------------------------------------------------------
describe('PendingInvitesBanner', () => {
  it('pluralises players + games correctly', () => {
    const { getByText } = render(
      <PendingInvitesBanner
        playerCount={1}
        gameCount={1}
        onPress={() => {}}
      />,
    );
    expect(getByText(/1 player waiting/)).toBeTruthy();
    expect(getByText(/1 game pending/)).toBeTruthy();
  });

  it('uses plural forms for counts greater than 1', () => {
    const { getByText } = render(
      <PendingInvitesBanner
        playerCount={4}
        gameCount={2}
        onPress={() => {}}
      />,
    );
    expect(getByText(/4 players waiting/)).toBeTruthy();
    expect(getByText(/2 games pending/)).toBeTruthy();
  });

  it('fires onPress when the Send Invites button is tapped', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <PendingInvitesBanner playerCount={1} gameCount={1} onPress={onPress} />,
    );
    fireEvent.press(getByLabelText('Send invites'));
    expect(onPress).toHaveBeenCalled();
  });

  it('fires onDismiss when the X is tapped', () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <PendingInvitesBanner
        playerCount={1}
        gameCount={1}
        onPress={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(getByLabelText('Dismiss pending invites banner'));
    expect(onDismiss).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ProfileBanner
// ---------------------------------------------------------------------------
describe('ProfileBanner', () => {
  it('navigates to onboarding when pressed', () => {
    const { getByLabelText } = render(<ProfileBanner percent={50} />);
    fireEvent.press(getByLabelText('Finish setting up your profile'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding');
  });

  it('rounds percent for display', () => {
    const { getByText } = render(<ProfileBanner percent={62.7} />);
    expect(getByText('63%')).toBeTruthy();
  });

  it('clamps percent into the [0, 100] range', () => {
    const { getByText, rerender } = render(<ProfileBanner percent={120} />);
    expect(getByText('100%')).toBeTruthy();

    rerender(<ProfileBanner percent={-5} />);
    expect(getByText('0%')).toBeTruthy();
  });

  it('fires onDismiss without bubbling to the card press', () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <ProfileBanner percent={50} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByLabelText('Dismiss profile banner'));
    expect(onDismiss).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NewUserWelcome
// ---------------------------------------------------------------------------
describe('NewUserWelcome', () => {
  it('renders the welcome copy + three CTAs', () => {
    const { getByText } = render(<NewUserWelcome />);
    expect(getByText('Welcome to Beach League')).toBeTruthy();
    expect(getByText('Find a League')).toBeTruthy();
    expect(getByText('Add Your First Game')).toBeTruthy();
    expect(getByText('Find Courts')).toBeTruthy();
  });

  it('each CTA routes to the expected destination', () => {
    const { getByText } = render(<NewUserWelcome />);
    fireEvent.press(getByText('Find a League'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/find-leagues');
    fireEvent.press(getByText('Add Your First Game'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/add-games');
    fireEvent.press(getByText('Find Courts'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/courts');
  });
});

// ---------------------------------------------------------------------------
// TournamentsEmpty
// ---------------------------------------------------------------------------
describe('TournamentsEmpty', () => {
  it('renders the two tournament CTAs', () => {
    const { getByText } = render(<TournamentsEmpty />);
    expect(getByText('Browse Nearby')).toBeTruthy();
    expect(getByText('+ Create')).toBeTruthy();
  });

  it('routes each CTA to the expected target', () => {
    const { getByText } = render(<TournamentsEmpty />);
    fireEvent.press(getByText('Browse Nearby'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/tournaments');
    fireEvent.press(getByText('+ Create'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/tournament/create');
  });
});

// ---------------------------------------------------------------------------
// DashboardSkeleton
// ---------------------------------------------------------------------------
describe('DashboardSkeleton', () => {
  it('renders several loading skeleton rectangles', () => {
    const { getAllByTestId } = render(<DashboardSkeleton />);
    // 1 header + 2 per section × 5 sections × 2 skel rects per section = plenty.
    expect(getAllByTestId('loading-skeleton').length).toBeGreaterThanOrEqual(
      5,
    );
  });
});
