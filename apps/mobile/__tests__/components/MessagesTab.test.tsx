/**
 * Behavior tests for MessagesTab — the Social hub's Messages subnav container.
 *
 * Covers:
 *   - Loading skeleton while data is fetching
 *   - Empty state when no conversations
 *   - Error state with retry
 *   - Conversation list with unread/read rows
 *   - Avatar color seeded from the peer player id (S2 — same player must render
 *     the same avatar color on every screen, not a flat hand-rolled color)
 *   - Search filtering
 *   - Navigation on conversation press
 *   - Compose action published into the hub header via setHeaderAction
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  render as testingRender,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => ({}),
}));

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

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    textInverse: '#fffdf8',
    textTertiary: '#697577',
  }),
}));

const mockGetConversations = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
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

import MessagesTab from '@/components/screens/Social/MessagesTab';

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
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  mockGetConversations.mockResolvedValue(MOCK_CONVERSATIONS);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('MessagesTab — loading state', () => {
  it('renders loading skeleton while data is fetching', async () => {
    mockGetConversations.mockReturnValue(new Promise(() => {}));
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-loading')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('MessagesTab — empty state', () => {
  it('renders empty state when no conversations returned', async () => {
    mockGetConversations.mockResolvedValue({ items: [], total_count: 0 });
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-empty-state')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('MessagesTab — error state', () => {
  it('renders error state when fetch fails', async () => {
    mockGetConversations.mockRejectedValue(new Error('Network error'));
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-error-state')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetConversations.mockRejectedValue(new Error('fail'));
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('messages-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetConversations.mockRejectedValueOnce(new Error('fail'));
    mockGetConversations.mockResolvedValue({ items: [], total_count: 0 });
    render(<MessagesTab />);
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

describe('MessagesTab — conversations list', () => {
  it('renders a row for each conversation', async () => {
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.getByTestId('convo-row-11')).toBeTruthy();
    });
  });

  it('shows an unread dot for unread conversations', async () => {
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-unread-dot-10')).toBeTruthy();
    });
  });

  it('does not show unread dot for read conversations', async () => {
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-11')).toBeTruthy();
      expect(screen.queryByTestId('convo-unread-dot-11')).toBeNull();
    });
  });

  it('displays the conversation partner name', async () => {
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByText('Alex Torres')).toBeTruthy();
    });
  });

  it('seeds each row avatar color from the peer player id (S2)', async () => {
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
    });

    // player_id 10 → 10 % 6 === 4 → variety entry #fde68a.
    const rowA = within(screen.getByTestId('convo-row-10'));
    const avatarA = rowA.getByTestId('convo-avatar-10');
    expect(StyleSheet.flatten(avatarA.props.style)).toEqual(
      expect.objectContaining({ backgroundColor: '#fde68a' }),
    );

    // player_id 11 → 11 % 6 === 5 → variety entry #fbcfe8.
    const rowB = within(screen.getByTestId('convo-row-11'));
    const avatarB = rowB.getByTestId('convo-avatar-11');
    expect(StyleSheet.flatten(avatarB.props.style)).toEqual(
      expect.objectContaining({ backgroundColor: '#fbcfe8' }),
    );
  });

  it('navigates to thread when conversation row is pressed', async () => {
    render(<MessagesTab />);
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

describe('MessagesTab — search', () => {
  it('renders search input', async () => {
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.getByTestId('messages-search-input')).toBeTruthy();
    });
  });

  it('filters conversations by name when search query is typed', async () => {
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.getByTestId('convo-row-11')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('messages-search-input'), 'Alex');
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.queryByTestId('convo-row-11')).toBeNull();
    });
  });

  it('shows all conversations when search is cleared', async () => {
    render(<MessagesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.getByTestId('convo-row-11')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('messages-search-input'), 'Alex');
    fireEvent.changeText(screen.getByTestId('messages-search-input'), '');
    await waitFor(() => {
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
      expect(screen.getByTestId('convo-row-11')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Compose action (published into the hub header)
// ---------------------------------------------------------------------------

describe('MessagesTab — compose action', () => {
  it('publishes a compose action node via setHeaderAction on mount', async () => {
    const mockSetHeaderAction = jest.fn();
    const mockOnCompose = jest.fn();
    render(
      <MessagesTab setHeaderAction={mockSetHeaderAction} onCompose={mockOnCompose} />,
    );
    await waitFor(() => {
      expect(mockSetHeaderAction).toHaveBeenCalledWith(expect.anything());
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
    });
    const [node] = mockSetHeaderAction.mock.calls[0];
    expect(node).toBeTruthy();
  });

  it('invokes onCompose when the published compose button is pressed', async () => {
    const mockSetHeaderAction = jest.fn();
    const mockOnCompose = jest.fn();
    render(
      <MessagesTab setHeaderAction={mockSetHeaderAction} onCompose={mockOnCompose} />,
    );
    await waitFor(() => {
      expect(mockSetHeaderAction).toHaveBeenCalledWith(expect.anything());
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
    });

    const [composeNode] = mockSetHeaderAction.mock.calls[0];
    // Wrap in a plain View: fireEvent.press needs an ancestor above the
    // Pressable to walk up to for its onPress handler — rendering the
    // Pressable as the tree root leaves nothing to walk up to.
    render(<View>{composeNode}</View>);

    fireEvent.press(screen.getByTestId('messages-compose-btn'));
    expect(mockOnCompose).toHaveBeenCalled();
  });

  it('clears the header action on unmount', async () => {
    const mockSetHeaderAction = jest.fn();
    const { unmount } = render(
      <MessagesTab setHeaderAction={mockSetHeaderAction} onCompose={jest.fn()} />,
    );
    await waitFor(() => {
      expect(mockSetHeaderAction).toHaveBeenCalledWith(expect.anything());
      expect(screen.getByTestId('convo-row-10')).toBeTruthy();
    });
    unmount();
    expect(mockSetHeaderAction).toHaveBeenLastCalledWith(null);
  });
});
