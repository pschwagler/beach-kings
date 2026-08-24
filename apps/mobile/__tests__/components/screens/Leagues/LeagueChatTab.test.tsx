import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LeagueChatMessage } from '@beach-kings/shared';
import type { UseLeagueChatTabResult } from '@/components/screens/Leagues/useLeagueChatTab';

const mockUseLeagueChatTab = jest.fn();
const mockOnChangeText = jest.fn();
const mockOnSend = jest.fn(async () => undefined);

jest.mock('@/components/screens/Leagues/useLeagueChatTab', () => ({
  useLeagueChatTab: (...args: unknown[]) => mockUseLeagueChatTab(...args),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ brandTeal: '#007788' }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(async () => undefined),
}));

import LeagueChatTab from '@/components/screens/Leagues/LeagueChatTab';

function renderChat(draft = '') {
  return render(
    <LeagueChatTab
      leagueId={7}
      draft={draft}
      onDraftChange={mockOnChangeText}
    />,
  );
}

const MESSAGE: LeagueChatMessage = {
  id: 1,
  league_id: 7,
  user_id: 42,
  player_id: 12,
  player_name: 'Alex Morgan',
  message: 'See everyone at the courts!',
  created_at: '2026-07-18T14:30:00Z',
  is_mine: false,
  initials: 'AM',
};

function arrangeHook(
  overrides: Partial<UseLeagueChatTabResult> = {},
): void {
  mockUseLeagueChatTab.mockReturnValue({
    messages: [],
    isLoading: false,
    isError: false,
    messageText: '',
    isSending: false,
    sendError: null,
    onChangeText: mockOnChangeText,
    onSend: mockOnSend,
    ...overrides,
  } satisfies UseLeagueChatTabResult);
}

beforeEach(() => {
  jest.clearAllMocks();
  arrangeHook();
});

describe('LeagueChatTab', () => {
  it('explains an empty chat while keeping the composer usable', () => {
    arrangeHook({ messageText: 'Who is playing tonight?' });

    renderChat('Who is playing tonight?');

    expect(screen.getByTestId('league-chat-empty-state')).toBeTruthy();
    expect(screen.getByText('No messages yet')).toBeTruthy();
    expect(screen.getByText('Be the first to message your league.')).toBeTruthy();
    expect(screen.getByTestId('chat-message-input')).toHaveProp(
      'value',
      'Who is playing tonight?',
    );

    fireEvent.changeText(
      screen.getByTestId('chat-message-input'),
      'Games this weekend?',
    );
    expect(mockOnChangeText).toHaveBeenCalledWith('Games this weekend?');

    fireEvent.press(screen.getByTestId('chat-send-button'));
    expect(mockOnSend).toHaveBeenCalledTimes(1);
  });

  it('suppresses the empty state when messages exist', () => {
    arrangeHook({ messages: [MESSAGE] });

    renderChat();

    expect(screen.queryByTestId('league-chat-empty-state')).toBeNull();
    expect(screen.getByTestId('message-bubble-1')).toBeTruthy();
    expect(screen.getByText('See everyone at the courts!')).toBeTruthy();
    expect(screen.getByTestId('chat-message-input')).toBeTruthy();
  });

  it('does not label normal pending delivery as reviewing', () => {
    arrangeHook({
      messages: [
        {
          ...MESSAGE,
          created_at: new Date().toISOString(),
          is_mine: true,
          moderation_visibility: 'pending',
        },
      ],
    });

    renderChat();

    expect(screen.queryByText(/Reviewing|Delivery delayed/)).toBeNull();
  });

  it('labels a materially delayed own message', () => {
    arrangeHook({
      messages: [{ ...MESSAGE, is_mine: true, moderation_visibility: 'pending' }],
    });
    renderChat();
    expect(screen.getByText(/Delivery delayed/)).toBeTruthy();
  });

  it('never shows sender delivery status on an incoming message', () => {
    arrangeHook({
      messages: [{ ...MESSAGE, is_mine: false, moderation_visibility: 'pending' }],
    });
    renderChat();
    expect(screen.getByText('See everyone at the courts!')).toBeTruthy();
    expect(screen.queryByText(/Delivery delayed/)).toBeNull();
  });

  it('renders the loading state without an empty state or composer', () => {
    arrangeHook({ isLoading: true });

    renderChat();

    expect(screen.getByTestId('chat-loading')).toBeTruthy();
    expect(screen.queryByTestId('league-chat-empty-state')).toBeNull();
    expect(screen.queryByTestId('chat-message-input')).toBeNull();
  });

  it('renders the error state without an empty state or composer', () => {
    arrangeHook({ isError: true });

    renderChat();

    expect(screen.getByTestId('chat-error')).toBeTruthy();
    expect(screen.getByText('Failed to load messages')).toBeTruthy();
    expect(screen.queryByTestId('league-chat-empty-state')).toBeNull();
    expect(screen.queryByTestId('chat-message-input')).toBeNull();
  });
});
