/**
 * Behavior tests for FriendsTab — the Social hub's Friends subnav container.
 *
 * FriendsTab is a thin container: it owns the search query + the shared
 * useFriends hook and wires navigation, then spreads everything into the
 * presentational FriendsBody (which is covered exhaustively by its own suite).
 * These tests exercise the container's own logic in isolation by mocking both
 * the hook and the body:
 *   - Spreads the hook result + search state into FriendsBody.
 *   - onPlayerPress pushes the player profile route.
 *   - onFindPlayers forwards to the injected callback (in-hub subnav switch).
 *   - setSearchQuery updates the query the body receives.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseFriends = jest.fn();

jest.mock('@/components/screens/FindPlayers/useFriends', () => ({
  useFriends: (opts: unknown) => mockUseFriends(opts),
}));

// Replace the body with a lightweight probe that surfaces the props the
// container hands down so we can assert wiring without rendering the real list.
jest.mock('@/components/screens/Social/FriendsBody', () => {
  const React = require('react');
  const { Pressable, Text, TextInput } = require('react-native');
  return {
    __esModule: true,
    default: (props: {
      searchQuery: string;
      setSearchQuery: (v: string) => void;
      onPlayerPress: (id: number) => void;
      onFindPlayers: () => void;
      friends: readonly { player_id: number }[];
    }) => (
      <>
        <Text testID="body-search-value">{props.searchQuery}</Text>
        <Text testID="body-friends-count">{String(props.friends.length)}</Text>
        <TextInput
          testID="body-search-input"
          value={props.searchQuery}
          onChangeText={props.setSearchQuery}
        />
        <Pressable
          testID="body-player-press"
          onPress={() => props.onPlayerPress(42)}
        >
          <Text>player</Text>
        </Pressable>
        <Pressable testID="body-find-players" onPress={props.onFindPlayers}>
          <Text>find</Text>
        </Pressable>
      </>
    ),
  };
});

import FriendsTab from '@/components/screens/Social/FriendsTab';

const FRIENDS_RESULT = {
  friends: [{ player_id: 1 }, { player_id: 2 }],
  friendRequests: [],
  suggestions: [],
  isLoadingFriends: false,
  friendsError: null,
  friendRequestsError: null,
  suggestionsError: null,
  isRefreshingFriends: false,
  onRefreshFriends: jest.fn(),
  onRetryFriends: jest.fn(),
  onAcceptRequest: jest.fn(),
  onDeclineRequest: jest.fn(),
  pendingAddIds: new Set<number>(),
  onAddSuggestion: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFriends.mockReturnValue(FRIENDS_RESULT);
});

describe('FriendsTab', () => {
  it('requests suggestions and spreads the hook result into FriendsBody', () => {
    render(<FriendsTab />);

    expect(mockUseFriends).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: '', withSuggestions: true }),
    );
    expect(screen.getByTestId('body-friends-count').props.children).toBe('2');
  });

  it('pushes the player profile route on player press', () => {
    render(<FriendsTab />);

    fireEvent.press(screen.getByTestId('body-player-press'));

    expect(mockPush).toHaveBeenCalledWith('/(stack)/player/42');
  });

  it('forwards onFindPlayers to the injected callback (no push)', () => {
    const onFindPlayers = jest.fn();
    render(<FriendsTab onFindPlayers={onFindPlayers} />);

    fireEvent.press(screen.getByTestId('body-find-players'));

    expect(onFindPlayers).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not throw when onFindPlayers is omitted', () => {
    render(<FriendsTab />);

    expect(() =>
      fireEvent.press(screen.getByTestId('body-find-players')),
    ).not.toThrow();
  });

  it('updates the search query the body receives', () => {
    render(<FriendsTab />);

    fireEvent.changeText(screen.getByTestId('body-search-input'), 'morgan');

    expect(screen.getByTestId('body-search-value').props.children).toBe(
      'morgan',
    );
    expect(mockUseFriends).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchQuery: 'morgan' }),
    );
  });
});
