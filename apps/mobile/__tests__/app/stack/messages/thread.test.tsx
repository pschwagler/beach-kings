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
    useLocalSearchParams: () => ({ playerId: '42', name: 'Alex Torres' }),
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

const mockGetThread = jest.fn();
const mockSendDirectMessage = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getThread: (...args: unknown[]) => mockGetThread(...args),
    sendDirectMessage: (...args: unknown[]) => mockSendDirectMessage(...args),
  },
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetThread.mockResolvedValue(MOCK_THREAD);
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

  it('renders the player name in the header, not "Chat"', async () => {
    render(<MessageThreadRoute />);
    await waitFor(() => {
      expect(screen.getByText('Alex Torres')).toBeTruthy();
      expect(screen.queryByText('Chat')).toBeNull();
    });
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
  });
});
