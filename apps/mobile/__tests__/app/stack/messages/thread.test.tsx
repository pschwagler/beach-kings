/**
 * Behavior tests for the Message Thread screen.
 *
 * Covers:
 *   - Loading skeleton while data is fetching
 *   - Empty thread state (no messages yet)
 *   - Error state with retry
 *   - Message bubbles render for each message
 *   - Own messages vs received messages
 *   - Date dividers between different days
 *   - Message input presence
 *   - Send button disabled when input is empty
 *   - Send dispatches api.sendDirectMessage and clears input
 *   - Send error message displays
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import {
  render as testingRender,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = jest.fn(() => true);
let mockSegments: string[] = ['(stack)', 'messages', '[playerId]'];

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: mockReplace,
      canGoBack: mockCanGoBack,
    }),
    useLocalSearchParams: () => ({ playerId: '42', name: 'Alex Torres' }),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => mockSegments,
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
    Easing: { inOut: () => ({}), in: () => ({}), out: () => ({}), cubic: {} },
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

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    textTertiary: '#777777',
    textInverse: '#ffffff',
  }),
}));

const mockGetThread = jest.fn();
const mockGetPublicPlayer = jest.fn();
const mockSendDirectMessage = jest.fn();
const mockMarkThreadRead = jest.fn();
const mockBlockPlayer = jest.fn();
const mockUnblockPlayer = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getThread: (...args: unknown[]) => mockGetThread(...args),
    getPublicPlayer: (...args: unknown[]) => mockGetPublicPlayer(...args),
    sendDirectMessage: (...args: unknown[]) => mockSendDirectMessage(...args),
    markThreadRead: (...args: unknown[]) => mockMarkThreadRead(...args),
    blockPlayer: (...args: unknown[]) => mockBlockPlayer(...args),
    unblockPlayer: (...args: unknown[]) => mockUnblockPlayer(...args),
  },
}));

jest.mock('@/hooks/useCurrentPlayer', () => ({
  useCurrentPlayer: () => ({ data: { id: 0 } }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7 },
    isAuthenticated: true,
  }),
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import MessageThreadRoute from '../../../../app/(stack)/messages/[playerId]';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const NOW = '2026-04-19T15:00:00Z';
const YESTERDAY = '2026-04-18T10:00:00Z';

const MOCK_THREAD = {
  items: [
    {
      id: 1,
      sender_player_id: 10,
      receiver_player_id: 0,
      message_text: 'Hey! Are you playing Sunday?',
      is_read: true,
      read_at: NOW,
      created_at: NOW,
    },
    {
      id: 2,
      sender_player_id: 0,
      receiver_player_id: 10,
      message_text: 'Yeah, I should be there!',
      is_read: true,
      read_at: NOW,
      created_at: YESTERDAY,
    },
  ],
  total_count: 2,
};

let queryClient: QueryClient;

function render(ui: React.ReactElement) {
  return testingRender(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  mockCanGoBack = jest.fn(() => true);
  mockSegments = ['(stack)', 'messages', '[playerId]'];
  mockGetThread.mockResolvedValue(MOCK_THREAD);
  mockGetPublicPlayer.mockResolvedValue({
    id: 42,
    full_name: 'Alex Torres',
    profile_picture_url: null,
  });
  mockMarkThreadRead.mockResolvedValue({ status: 'ok', marked_count: 1 });
  mockBlockPlayer.mockResolvedValue({ player_id: 42, status: 'blocked' });
  mockUnblockPlayer.mockResolvedValue({ player_id: 42, status: 'unblocked' });
  mockSendDirectMessage.mockResolvedValue({
    id: 99,
    sender_player_id: 0,
    receiver_player_id: 10,
    message_text: 'New message!',
    is_read: false,
    read_at: null,
    created_at: new Date().toISOString(),
  });
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('MessageThreadScreen — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetThread.mockReturnValue(new Promise(() => {}));
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('MessageThreadScreen — empty state', () => {
  it('renders empty thread state when no messages', async () => {
    mockGetThread.mockResolvedValue({ items: [], total_count: 0 });
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('thread-empty-state')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('MessageThreadScreen — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetThread.mockRejectedValue(new Error('Network error'));
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-error-state')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetThread.mockRejectedValueOnce(new Error('fail'));
    mockGetThread.mockResolvedValue({ items: [], total_count: 0 });
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-retry-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('messages-retry-btn'));
    await waitFor(() => {
      expect(mockGetThread).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Message list
// ---------------------------------------------------------------------------

describe('MessageThreadScreen — messages list', () => {
  it('marks incoming unread messages read when the thread opens', async () => {
    mockGetThread.mockResolvedValue({
      items: [
        {
          id: 3,
          sender_player_id: 42,
          receiver_player_id: 0,
          message_text: 'Unread message',
          is_read: false,
          read_at: null,
          created_at: NOW,
        },
      ],
      total_count: 1,
    });

    render(<MessageThreadRoute />);

    await waitFor(() => {
      expect(mockMarkThreadRead).toHaveBeenCalledTimes(1);
      expect(mockMarkThreadRead).toHaveBeenCalledWith(42);
    });
    await waitFor(() => {
      expect(queryClient.isMutating() + queryClient.isFetching()).toBe(0);
    });
  });

  it('renders thread screen when messages are loaded', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('thread-screen')).toBeTruthy();
    });
  });

  it('renders a bubble for each message', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('msg-bubble-1')).toBeTruthy();
      expect(screen.getByTestId('msg-bubble-2')).toBeTruthy();
    });
  });

  it('displays message text in each bubble', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByText('Hey! Are you playing Sunday?')).toBeTruthy();
    });
  });

  it('labels an own pending message as under review', async () => {
    mockGetThread.mockResolvedValue({
      items: [
        {
          id: 4,
          sender_player_id: 0,
          receiver_player_id: 42,
          message_text: 'Waiting for review',
          is_read: false,
          read_at: null,
          created_at: NOW,
          moderation_visibility: 'pending',
        },
      ],
      total_count: 1,
    });

    render(<MessageThreadRoute />);

    await waitFor(() => {
      expect(screen.getByText(/Reviewing/)).toBeTruthy();
    });
  });

  it('renders the player name in the header, not "Chat"', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('thread-screen')).toBeTruthy();
      expect(screen.getByText('Alex Torres')).toBeTruthy();
      expect(screen.queryByText('Chat')).toBeNull();
    });
  });

  it('seeds the header avatar color from the peer player id (S2)', async () => {
    render(<MessageThreadRoute />);
    // Peer playerId is 42 → 42 % 6 === 0 → first variety entry (#bae6fd). Seeding
    // by id (not a flat variant) keeps this player's color identical everywhere.
    const avatar = await waitFor(() => {
      expect(screen.getByTestId('thread-screen')).toBeTruthy();
      return screen.getByLabelText('Alex Torres');
    });
    expect(StyleSheet.flatten(avatar.props.style)).toEqual(
      expect.objectContaining({ backgroundColor: '#bae6fd' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Back button (useBack — S1 dead-button fix)
// ---------------------------------------------------------------------------

describe('MessageThreadScreen — back button', () => {
  it('pops the stack when there is back history', async () => {
    mockCanGoBack = jest.fn(() => true);
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('thread-screen')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('thread-back-btn'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to the messages Up target instead of no-oping on a deep-link / cold start with no history', async () => {
    // Regression test: the back Pressable used to call bare router.back(),
    // which is a dead button when the thread is opened from a notification
    // tap or deep link (no history to pop).
    mockCanGoBack = jest.fn(() => false);
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('thread-screen')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('thread-back-btn'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/social?tab=messages');
  });
});

describe('MessageThreadScreen — player safety', () => {
  it('confirms blocking and exits to the conversation list after success', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('thread-screen')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('thread-profile-btn'));
    fireEvent.press(screen.getByTestId('action-sheet-block'));
    expect(screen.getByText("They won't be notified. Direct contact, friendship, discovery, and invites stop in both directions. Shared league facts remain visible. This conversation is hidden until you unblock them.")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('block-player-dialog-confirm'));
    });

    await waitFor(() => expect(mockBlockPlayer).toHaveBeenCalledWith(42));
    expect(mockReplace).toHaveBeenCalledWith('/(stack)/messages');
  });

  it('uses generic unavailable copy when the viewer did not initiate the restriction', async () => {
    mockGetThread.mockResolvedValue({
      items: [],
      total_count: 0,
      capability: {
        actions: { direct_message: false },
        blocked_by_viewer: false,
        viewer_restricted: false,
      },
    });
    render(<MessageThreadRoute />);

    await waitFor(() => {
      expect(screen.getByText("This interaction isn't available.")).toBeTruthy();
    });
    expect(screen.queryByText('Unblock')).toBeNull();
    expect(screen.queryByTestId('message-input')).toBeNull();
  });

  it('explains only the viewer-initiated block and offers unblock', async () => {
    mockGetThread.mockResolvedValue({
      items: [],
      total_count: 0,
      capability: {
        actions: { direct_message: false },
        blocked_by_viewer: true,
        viewer_restricted: false,
      },
    });
    render(<MessageThreadRoute />);

    await waitFor(() => {
      expect(screen.getByText('You blocked this player.')).toBeTruthy();
    });
    expect(screen.getByText('Unblock')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Input bar
// ---------------------------------------------------------------------------

describe('MessageThreadScreen — input bar', () => {
  it('renders message input', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('message-input')).toBeTruthy();
    });
  });

  it('renders send button', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('send-btn')).toBeTruthy();
    });
  });

  it('typing in input updates displayed text', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('message-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('message-input'), 'Hello!');
    expect(screen.getByDisplayValue('Hello!')).toBeTruthy();
  });

  it('calls sendDirectMessage when send is pressed with text', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('message-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('message-input'), 'Test message');
    await act(async () => {
      fireEvent.press(screen.getByTestId('send-btn'));
    });
    await waitFor(() => {
      expect(mockSendDirectMessage).toHaveBeenCalledWith(42, 'Test message');
    });
    await waitFor(() => {
      expect(queryClient.isMutating() + queryClient.isFetching()).toBe(0);
    });
  });

  it('clears input after successful send', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('message-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('message-input'), 'Hello!');
    await act(async () => {
      fireEvent.press(screen.getByTestId('send-btn'));
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue('')).toBeTruthy();
    });
    await waitFor(() => {
      expect(queryClient.isMutating() + queryClient.isFetching()).toBe(0);
    });
  });
});
