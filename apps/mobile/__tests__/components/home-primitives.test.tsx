/**
 * Tests for the simple home dashboard primitives: HomeHeader, QuickStatsRow,
 * SectionHeader, SectionError, HomeLeadAction, and DashboardSkeleton.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Router mock — fresh jest.fn per describe via beforeEach.
const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    textInverse: '#fffdf8',
    brandTeal: '#155b65',
    brandGold: '#e0b44c',
  }),
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
    ChatIcon: stub('Chat'),
    BellIcon: stub('Bell'),
    UsersIcon: stub('Users'),
    XIcon: stub('X'),
    ChevronRightIcon: stub('ChevronRight'),
  };
});

// Avatar stub — reflects the name and (via accessibilityHint) the colorSeed so
// call sites can assert they seed the identity color from the player id.
jest.mock('@/components/ui/Avatar', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function Avatar({
    name,
    colorSeed,
  }: {
    name: string;
    colorSeed?: number | string;
  }) {
    return (
      <Text
        testID="avatar"
        accessibilityHint={colorSeed != null ? String(colorSeed) : undefined}
      >
        {name}
      </Text>
    );
  };
});

// react-native-svg stub used by the Home brand motif — swap to plain Views so we
// don't need the real native deps in jest-dom.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );
  return {
    __esModule: true,
    default: Stub,
    Svg: Stub,
    Circle: Stub,
    Path: Stub,
    Line: Stub,
  };
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
import DashboardSkeleton from '@/components/home/DashboardSkeleton';
import HomeLeadAction from '@/components/home/HomeLeadAction';

const useWindowDimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);

beforeEach(() => {
  mockPush.mockClear();
  mockNavigate.mockClear();
  useWindowDimensionsSpy.mockReturnValue({
    width: 393,
    height: 852,
    scale: 3,
    fontScale: 1,
  });
});

afterAll(() => {
  useWindowDimensionsSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// HomeHeader
// ---------------------------------------------------------------------------
describe('HomeHeader', () => {
  it('renders the brand lockup + avatar', () => {
    const { getByLabelText, getByTestId } = render(
      <HomeHeader
        userName="Ava"
        avatarUrl={null}
        dmUnreadCount={0}
        notificationUnreadCount={0}
      />,
    );
    expect(getByTestId('home-brand-lockup')).toBeTruthy();
    expect(getByLabelText('Beach League home')).toBeTruthy();
    expect(getByTestId('avatar')).toBeTruthy();
  });

  it('preserves header actions without capping text at accessibility sizes', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 393,
      height: 852,
      scale: 3,
      fontScale: 2,
    });

    const { getByLabelText, getByTestId, queryByTestId } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={0}
        notificationUnreadCount={0}
      />,
    );

    expect(queryByTestId('home-brand-lockup')).toBeNull();
    expect(getByTestId('home-brand-mark')).toBeTruthy();
    expect(getByLabelText('Beach League home')).toBeTruthy();
    expect(getByLabelText('Messages')).toBeTruthy();
    expect(getByLabelText('Notifications')).toBeTruthy();
  });

  it('seeds the avatar color with the player id for cross-screen consistency', () => {
    const { getByTestId } = render(
      <HomeHeader
        userName="Ava"
        playerId={7}
        dmUnreadCount={0}
        notificationUnreadCount={0}
      />,
    );
    // Seeded by numeric player id (not name/variant) so the same player renders
    // the same color here as on the profile / message thread / roster (S2).
    expect(getByTestId('avatar').props.accessibilityHint).toBe('7');
  });

  it('hides badges when unread counts are zero', () => {
    const { queryByTestId } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={0}
        notificationUnreadCount={0}
      />,
    );
    expect(queryByTestId('messages-unread-badge')).toBeNull();
    expect(queryByTestId('notifications-unread-badge')).toBeNull();
  });

  it('shows unread counts on both badges', () => {
    const { getByTestId } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={3}
        notificationUnreadCount={5}
      />,
    );
    expect(getByTestId('messages-unread-badge').props.children.props.children).toBe(3);
    expect(getByTestId('notifications-unread-badge').props.children.props.children).toBe(5);
  });

  it('clamps counts above 99 to 99+', () => {
    const { getByTestId } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={120}
        notificationUnreadCount={0}
      />,
    );
    expect(getByTestId('messages-unread-badge').props.children.props.children).toBe('99+');
  });

  it('navigates when each icon button is pressed', () => {
    const { getByLabelText } = render(
      <HomeHeader
        userName="Ava"
        dmUnreadCount={2}
        notificationUnreadCount={0}
      />,
    );
    // Messages stays in Social; the global bell owns a standalone inbox.
    fireEvent.press(getByLabelText('Messages, 2 unread'));
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/social?tab=messages');

    fireEvent.press(getByLabelText('Notifications'));
    expect(mockNavigate).toHaveBeenCalledWith('/(stack)/notifications');

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
    expect(getByText('1450')).toBeTruthy();
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
    const { getByRole, getByLabelText } = render(
      <SectionHeader title="Leagues" linkLabel="See all" onLinkPress={onLinkPress} />,
    );
    expect(getByLabelText('See all, Leagues')).toBeTruthy();
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
// HomeLeadAction
// ---------------------------------------------------------------------------
describe('HomeLeadAction', () => {
  it('renders the record-game fallback as one branded lead', () => {
    const { getByLabelText, getByTestId } = render(
      <HomeLeadAction state={{ kind: 'record-game' }} onRetryActiveSession={() => {}} />,
    );
    expect(getByTestId('home-lead-record-game')).toBeTruthy();
    expect(getByTestId('court-line-motif-home', {
      includeHiddenElements: true,
    })).toBeTruthy();
    fireEvent.press(getByLabelText('Record a Game'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/add-games');
  });

  it('uses truthful friend-request copy and opens Social Friends', () => {
    const { getByLabelText, getByText } = render(
      <HomeLeadAction
        state={{ kind: 'friend-request', count: 1, senderName: 'Avery Kim' }}
        onRetryActiveSession={() => {}}
      />,
    );
    expect(getByText('Avery Kim sent you a friend request.')).toBeTruthy();
    fireEvent.press(getByLabelText('Review Request'));
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/social?tab=friends');
  });

  it('uses the matching semantic foreground for each brand fill', () => {
    const gold = render(
      <HomeLeadAction state={{ kind: 'record-game' }} onRetryActiveSession={() => {}} />,
    );
    expect(gold.getByText('Record a Game').props.className).toContain(
      'text-on-brand-gold',
    );
    gold.unmount();

    const teal = render(
      <HomeLeadAction state={{ kind: 'active-session-error' }} onRetryActiveSession={() => {}} />,
    );
    expect(teal.getByText('Try Again').props.className).toContain(
      'text-on-brand-teal',
    );
  });

  it('retries rather than offering a new game when session absence is unknown', () => {
    const onRetry = jest.fn();
    const { getByLabelText, queryByLabelText } = render(
      <HomeLeadAction state={{ kind: 'active-session-error' }} onRetryActiveSession={onRetry} />,
    );
    expect(queryByLabelText('Record a Game')).toBeNull();
    fireEvent.press(getByLabelText('Try Again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('removes the decorative motif at accessibility text sizes', () => {
    useWindowDimensionsSpy.mockReturnValue({
      width: 393,
      height: 852,
      scale: 3,
      fontScale: 2,
    });

    const { queryByTestId } = render(
      <HomeLeadAction
        state={{ kind: 'record-game' }}
        onRetryActiveSession={() => {}}
      />,
    );
    expect(
      queryByTestId('court-line-motif-home', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DashboardSkeleton
// ---------------------------------------------------------------------------
describe('DashboardSkeleton', () => {
  it('renders several loading skeleton rectangles', () => {
    const { getAllByTestId } = render(<DashboardSkeleton />);
    // Header plus four section skeletons provides a stable loading surface.
    expect(getAllByTestId('loading-skeleton').length).toBeGreaterThanOrEqual(
      5,
    );
  });
});
