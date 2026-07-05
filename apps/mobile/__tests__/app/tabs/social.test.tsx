/**
 * Behavior-focused tests for the Social hub shell (SocialScreen).
 *
 * Phase 1 covers the 4-tab subnav shell:
 * - Renders the TopNav "Social" title and the SocialSubnav.
 * - Defaults to the Messages tab.
 * - Switching subnav tabs swaps the active body.
 * - The Friends and Find Players tabs each render their inline body containers
 *   (FriendsTab / FindPlayersTab).
 * - The `?tab=` param selects the initial tab (and falls back to Messages when
 *   the value is unrecognized).
 *
 * The per-tab data containers (MessagesTab / NotificationsTab / FriendsTab /
 * FindPlayersTab) are stubbed so these tests exercise shell routing, not the
 * underlying data hooks (which have their own suites).
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

// Mutable search-params so each test can drive the initial `?tab=`.
let mockParams: { tab?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

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

// TopNav stub renders its rightAction slot so per-tab header actions (published
// by the active tab via setHeaderAction) are assertable at the shell level.
jest.mock('@/components/ui/TopNav', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      rightAction,
    }: {
      title: string;
      rightAction?: React.ReactNode;
    }) => (
      <View>
        <Text testID="top-nav">{title}</Text>
        <View testID="top-nav-right">{rightAction}</View>
      </View>
    ),
  };
});

// Per-tab containers stubbed — shell tests should not touch their data hooks —
// but the stubs honor the shell wiring props (setHeaderAction / onCompose /
// onFindPlayers) so tab-switching and the header slot can be exercised.
jest.mock('@/components/screens/Social/MessagesTab', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  function MessagesTabStub({
    setHeaderAction,
    onCompose,
  }: {
    setHeaderAction?: (node: React.ReactNode | null) => void;
    onCompose?: () => void;
  }) {
    React.useEffect(() => {
      setHeaderAction?.(<Text testID="compose-action">compose</Text>);
      return () => setHeaderAction?.(null);
    }, [setHeaderAction]);
    return (
      <Pressable testID="messages-tab-stub" onPress={onCompose}>
        <Text>messages</Text>
      </Pressable>
    );
  }
  return { __esModule: true, default: MessagesTabStub };
});

jest.mock('@/components/screens/Social/NotificationsTab', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="notifications-tab-stub" />,
  };
});

jest.mock('@/components/screens/Social/FriendsTab', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ onFindPlayers }: { onFindPlayers?: () => void }) => (
      <Pressable testID="friends-tab-stub" onPress={onFindPlayers}>
        <Text>friends</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/screens/Social/FindPlayersTab', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="find-players-tab-stub" />,
  };
});

// expo-haptics — no-op (SocialSubnav fires light haptics on press).
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
}));

import SocialScreen from '../../../src/components/screens/Social/SocialScreen';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

describe('SocialScreen — chrome', () => {
  it('renders the TopNav with title "Social"', () => {
    render(<SocialScreen />);
    expect(screen.getByTestId('top-nav').props.children).toBe('Social');
  });

  it('renders the 4-tab subnav', () => {
    render(<SocialScreen />);
    expect(screen.getByTestId('social-subnav')).toBeTruthy();
    expect(screen.getByTestId('social-subnav-tab-messages')).toBeTruthy();
    expect(screen.getByTestId('social-subnav-tab-notifications')).toBeTruthy();
    expect(screen.getByTestId('social-subnav-tab-friends')).toBeTruthy();
    expect(screen.getByTestId('social-subnav-tab-findplayers')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Default tab
// ---------------------------------------------------------------------------

describe('SocialScreen — default tab', () => {
  it('shows the Messages tab by default', () => {
    render(<SocialScreen />);
    expect(screen.getByTestId('messages-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('notifications-tab-stub')).toBeNull();
  });

  it('marks Messages as the selected subnav tab by default', () => {
    render(<SocialScreen />);
    expect(
      screen.getByTestId('social-subnav-tab-messages').props.accessibilityState
        .selected,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

describe('SocialScreen — tab switching', () => {
  it('switches to Notifications when its tab is pressed', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('social-subnav-tab-notifications'));

    expect(screen.getByTestId('notifications-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('messages-tab-stub')).toBeNull();
  });

  it('shows the Friends body on the Friends tab', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('social-subnav-tab-friends'));

    expect(screen.getByTestId('friends-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('friends-shortcut')).toBeNull();
  });

  it('shows the Find Players body on the Find Players tab', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('social-subnav-tab-findplayers'));

    expect(screen.getByTestId('find-players-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('friends-tab-stub')).toBeNull();
  });

  it('can switch back to Messages after leaving it', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('social-subnav-tab-notifications'));
    fireEvent.press(screen.getByTestId('social-subnav-tab-messages'));

    expect(screen.getByTestId('messages-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('notifications-tab-stub')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — header-action slot + in-hub subnav switching
// ---------------------------------------------------------------------------

describe('SocialScreen — per-tab header action', () => {
  it('surfaces the active tab action in the TopNav right slot', () => {
    render(<SocialScreen />);
    // Messages is default; its stub publishes a compose action.
    expect(screen.getByTestId('compose-action')).toBeTruthy();
  });

  it('clears the header action when switching to a tab without one', () => {
    render(<SocialScreen />);
    expect(screen.getByTestId('compose-action')).toBeTruthy();

    fireEvent.press(screen.getByTestId('social-subnav-tab-friends'));
    expect(screen.queryByTestId('compose-action')).toBeNull();
  });
});

describe('SocialScreen — in-hub navigation', () => {
  it('switches to Find Players when the Friends CTA fires (no push)', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('social-subnav-tab-friends'));
    fireEvent.press(screen.getByTestId('friends-tab-stub'));

    expect(screen.getByTestId('find-players-tab-stub')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('switches to Find Players when Messages compose fires (no push)', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('messages-tab-stub'));

    expect(screen.getByTestId('find-players-tab-stub')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ?tab= deep-link param
// ---------------------------------------------------------------------------

describe('SocialScreen — ?tab= param', () => {
  it('opens directly on Notifications when tab=notifications', () => {
    mockParams = { tab: 'notifications' };
    render(<SocialScreen />);

    expect(screen.getByTestId('notifications-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('messages-tab-stub')).toBeNull();
  });

  it('opens directly on the Find Players body when tab=findplayers', () => {
    mockParams = { tab: 'findplayers' };
    render(<SocialScreen />);

    expect(screen.getByTestId('find-players-tab-stub')).toBeTruthy();
  });

  it('falls back to Messages when the tab param is unrecognized', () => {
    mockParams = { tab: 'bogus' };
    render(<SocialScreen />);

    expect(screen.getByTestId('messages-tab-stub')).toBeTruthy();
  });
});
