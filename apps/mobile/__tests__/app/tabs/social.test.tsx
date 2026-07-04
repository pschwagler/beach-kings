/**
 * Behavior-focused tests for the Social hub shell (SocialScreen).
 *
 * Phase 1 covers the 4-tab subnav shell:
 * - Renders the TopNav "Social" title and the SocialSubnav.
 * - Defaults to the Messages tab.
 * - Switching subnav tabs swaps the active body.
 * - Friends / Find Players tabs render the transitional shortcut placeholder,
 *   whose CTA navigates to the standalone find-players screen.
 * - The `?tab=` param selects the initial tab (and falls back to Messages when
 *   the value is unrecognized).
 *
 * The per-tab data containers (MessagesTab / NotificationsTab) are stubbed so
 * these tests exercise shell routing, not the Messages/Notifications data
 * hooks (which have their own suites).
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

jest.mock('@/components/ui/TopNav', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ title }: { title: string }) => (
      <Text testID="top-nav">{title}</Text>
    ),
  };
});

// Per-tab containers stubbed — shell tests should not touch their data hooks.
jest.mock('@/components/screens/Social/MessagesTab', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="messages-tab-stub" />,
  };
});

jest.mock('@/components/screens/Social/NotificationsTab', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="notifications-tab-stub" />,
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

  it('shows the shortcut placeholder on the Friends tab', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('social-subnav-tab-friends'));

    expect(screen.getByTestId('friends-shortcut')).toBeTruthy();
  });

  it('shows the shortcut placeholder on the Find Players tab', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('social-subnav-tab-findplayers'));

    expect(screen.getByTestId('friends-shortcut')).toBeTruthy();
  });

  it('placeholder CTA navigates to the find-players screen', () => {
    render(<SocialScreen />);
    fireEvent.press(screen.getByTestId('social-subnav-tab-friends'));
    fireEvent.press(screen.getByTestId('find-players-button'));

    expect(mockPush).toHaveBeenCalledWith('/(stack)/find-players');
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
// ?tab= deep-link param
// ---------------------------------------------------------------------------

describe('SocialScreen — ?tab= param', () => {
  it('opens directly on Notifications when tab=notifications', () => {
    mockParams = { tab: 'notifications' };
    render(<SocialScreen />);

    expect(screen.getByTestId('notifications-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('messages-tab-stub')).toBeNull();
  });

  it('opens directly on the Find Players placeholder when tab=findplayers', () => {
    mockParams = { tab: 'findplayers' };
    render(<SocialScreen />);

    expect(screen.getByTestId('friends-shortcut')).toBeTruthy();
  });

  it('falls back to Messages when the tab param is unrecognized', () => {
    mockParams = { tab: 'bogus' };
    render(<SocialScreen />);

    expect(screen.getByTestId('messages-tab-stub')).toBeTruthy();
  });
});
