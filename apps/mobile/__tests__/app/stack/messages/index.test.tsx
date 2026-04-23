/**
 * Behavior tests for the Messages inbox screen.
 *
 * Covers:
 *   - Loading skeleton while data is fetching
 *   - Empty state when no conversations
 *   - Error state with retry
 *   - Conversation list with unread/read rows
 *   - Search filtering
 *   - Navigation on conversation press
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
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

const mockGetConversations = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import MessagesListRoute from '../../../../app/(stack)/messages/index';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_CONVERSATIONS = {
  items: [
    {
      player_id: 10,
      full_name: 'Alex Torres',
      avatar: null,
      last_message_text: 'Are you in for Sunday?',
      last_message_at: '2026-04-19T12:00:00Z',
      last_message_sender_id: 10,
      unread_count: 2,
      is_friend: true,
    },
    {
      player_id: 11,
      full_name: 'Sam Rivera',
      avatar: null,
      last_message_text: 'Good game!',
      last_message_at: '2026-04-18T09:00:00Z',
      last_message_sender_id: 0,
      unread_count: 0,
      is_friend: true,
    },
  ],
  total_count: 2,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConversations.mockResolvedValue(MOCK_CONVERSATIONS);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('MessagesScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetConversations.mockReturnValue(new Promise(() => {}));
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('MessagesScreen — empty state', () => {
  it('renders empty state when no conversations returned', async () => {
    mockGetConversations.mockResolvedValue({ items: [], total_count: 0 });
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-empty-state')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('MessagesScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetConversations.mockRejectedValue(new Error('Network error'));
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-error-state')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetConversations.mockRejectedValue(new Error('fail'));
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetConversations.mockRejectedValueOnce(new Error('fail'));
    mockGetConversations.mockResolvedValue({ items: [], total_count: 0 });
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('messages-retry-btn'));
    await waitFor(() => {
      expect(mockGetConversations).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Conversations list
// ---------------------------------------------------------------------------

describe('MessagesScreen — conversations list', () => {
  it('renders a row for each conversation', async () => {
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.getByTestId('convo-row-11')).toBeTruthy();
    });
  });

  it('shows an unread dot for unread conversations', async () => {
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-unread-dot-10')).toBeTruthy();
    });
  });

  it('does not show unread dot for read conversations', async () => {
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.queryByTestId('convo-unread-dot-11')).toBeNull();
    });
  });

  it('displays the conversation partner name', async () => {
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByText('Alex Torres')).toBeTruthy();
    });
  });

  it('navigates to thread when conversation row is pressed', async () => {
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('convo-row-10'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(stack)/messages/10?name=Alex%20Torres');
    });
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('MessagesScreen — search', () => {
  it('renders search input', async () => {
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-search-input')).toBeTruthy();
    });
  });

  it('filters conversations by name when search query is typed', async () => {
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-search-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('messages-search-input'), 'Alex');
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.queryByTestId('convo-row-11')).toBeNull();
    });
  });

  it('shows all conversations when search is cleared', async () => {
    render(<MessagesListRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-search-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('messages-search-input'), 'Alex');
    fireEvent.changeText(screen.getByTestId('messages-search-input'), '');
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.getByTestId('convo-row-11')).toBeTruthy();
    });
  });
});
