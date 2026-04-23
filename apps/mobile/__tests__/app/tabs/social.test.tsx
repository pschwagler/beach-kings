/**
 * Behavior-focused tests for the Social tab (SocialScreen).
 *
 * Covers:
 * - Skeleton while loading
 * - Thread list with unread indicators
 * - Tapping a thread navigates to thread detail
 * - Empty state renders with CTA when no threads
 * - Error + retry
 * - Pull-to-refresh
 * - Friends segment renders shortcut CTA
 */

import React from 'react';
import {
  render,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import type { Conversation } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
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

jest.mock('@/contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: () => ({
    user: { player_id: 1 },
    isAuthenticated: true,
    isLoading: false,
    profileComplete: true,
  }),
}));

// LoadingSkeleton — simple testID stub
jest.mock('@/components/ui/LoadingSkeleton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="loading-skeleton" />,
  };
});

// SegmentControl — render real pressable segments for interaction tests
jest.mock('@/components/ui/SegmentControl', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      segments,
      selectedIndex,
      onSelect,
    }: {
      segments: string[];
      selectedIndex: number;
      onSelect: (i: number) => void;
    }) => (
      <View testID="segment-control">
        {segments.map((seg: string, i: number) => (
          <Pressable
            key={seg}
            testID={`segment-${seg.toLowerCase()}`}
            onPress={() => onSelect(i)}
            accessibilityState={{ selected: i === selectedIndex }}
          >
            <Text>{seg}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

// EmptyState — surface title text + action button
jest.mock('@/components/ui/EmptyState', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      description,
      actionLabel,
      onAction,
    }: {
      title: string;
      description?: string;
      actionLabel?: string;
      onAction?: () => void;
    }) => (
      <View testID="empty-state">
        <Text testID="empty-state-title">{title}</Text>
        {description != null && (
          <Text testID="empty-state-description">{description}</Text>
        )}
        {actionLabel != null && onAction != null && (
          <Pressable testID="empty-state-action" onPress={onAction}>
            <Text>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    ),
  };
});

// react-native-svg — no-op
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );
  return {
    default: Svg,
    Svg,
    Path: () => null,
    Circle: () => null,
  };
});

// expo-haptics — no-op
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
}));

// react-native-reanimated — deterministic opacity
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = jest.fn();
  return Reanimated;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    player_id: 42,
    full_name: 'Colan Gulla',
    avatar: null,
    last_message_text: 'See you at QBK tomorrow',
    last_message_at: new Date(Date.now() - 3_600_000).toISOString(),
    last_message_sender_id: 99,
    unread_count: 0,
    is_friend: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Import the screen component directly for white-box control
// ---------------------------------------------------------------------------

// We import SocialScreen directly (not social.tsx) to inject fetcherOverride.
import SocialScreen from '../../../src/components/screens/Social/SocialScreen';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SocialScreen — skeleton while loading', () => {
  it('renders the skeleton during initial load', () => {
    const neverResolves = () => new Promise<readonly Conversation[]>(() => {});
    const { getByTestId } = render(
      <SocialScreen fetcherOverride={neverResolves} />,
    );
    expect(getByTestId('conversation-skeleton')).toBeTruthy();
  });

  it('renders the TopNav with title "Social"', () => {
    const neverResolves = () => new Promise<readonly Conversation[]>(() => {});
    const { getByTestId } = render(
      <SocialScreen fetcherOverride={neverResolves} />,
    );
    expect(getByTestId('top-nav')).toBeTruthy();
  });
});

describe('SocialScreen — thread list with unread indicators', () => {
  it('renders conversation rows after loading', async () => {
    const conv = makeConversation({ full_name: 'Colan Gulla' });
    const fetcher = jest.fn().mockResolvedValue([conv]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    await findByTestId(`conversation-row-${conv.player_id}`);
  });

  it('renders unread dot for conversations with unread_count > 0', async () => {
    const unread = makeConversation({ unread_count: 3, player_id: 10 });
    const fetcher = jest.fn().mockResolvedValue([unread]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    await findByTestId('unread-dot');
  });

  it('does NOT render unread dot for conversations with unread_count === 0', async () => {
    const read = makeConversation({ unread_count: 0, player_id: 11 });
    const fetcher = jest.fn().mockResolvedValue([read]);

    const { queryByTestId, findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    await findByTestId(`conversation-row-${read.player_id}`);
    expect(queryByTestId('unread-dot')).toBeNull();
  });
});

describe('SocialScreen — thread navigation', () => {
  it('navigates to /(stack)/messages/:id when a thread is tapped', async () => {
    const conv = makeConversation({ player_id: 42 });
    const fetcher = jest.fn().mockResolvedValue([conv]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    const row = await findByTestId(`conversation-row-${conv.player_id}`);
    fireEvent.press(row);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/^\/\(stack\)\/messages\/42(\?.*)?$/),
    );
  });
});

describe('SocialScreen — empty state', () => {
  it('renders empty state when no conversations exist', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    const empty = await findByTestId('empty-state');
    expect(empty).toBeTruthy();
  });

  it('empty state shows "No conversations yet" title', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    const title = await findByTestId('empty-state-title');
    expect(title.props.children).toBe('No conversations yet');
  });

  it('empty state CTA navigates to find-players', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    const cta = await findByTestId('empty-state-action');
    fireEvent.press(cta);

    expect(mockPush).toHaveBeenCalledWith('/(stack)/find-players');
  });
});

describe('SocialScreen — error and retry', () => {
  it('shows error UI when the fetch rejects', async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValue(new Error('Network failure'));

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    await findByTestId('social-error');
  });

  it('retry button re-calls the fetcher', async () => {
    const conv = makeConversation();
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValue([conv]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    const retryBtn = await findByTestId('retry-button');
    await act(async () => {
      fireEvent.press(retryBtn);
    });

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SocialScreen — pull-to-refresh', () => {
  it('calls fetcher again on pull-to-refresh', async () => {
    const conv = makeConversation();
    const fetcher = jest.fn().mockResolvedValue([conv]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    // Wait for list to render
    await findByTestId('conversations-list');

    // Simulate pull-to-refresh
    const list = await findByTestId('conversations-list');
    const { refreshControl } = list.props;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      // Called once on mount + once on refresh
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SocialScreen — Friends segment', () => {
  it('shows the friends shortcut when Friends segment is selected', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    const friendsTab = await findByTestId('segment-friends');
    fireEvent.press(friendsTab);

    await findByTestId('friends-shortcut');
  });

  it('Find Players button in Friends segment navigates to find-players', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);

    const { findByTestId } = render(
      <SocialScreen fetcherOverride={fetcher} />,
    );

    const friendsTab = await findByTestId('segment-friends');
    fireEvent.press(friendsTab);

    const findBtn = await findByTestId('find-players-button');
    fireEvent.press(findBtn);

    expect(mockPush).toHaveBeenCalledWith('/(stack)/find-players');
  });
});
