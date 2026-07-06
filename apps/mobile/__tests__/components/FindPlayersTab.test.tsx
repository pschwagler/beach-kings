/**
 * Behavior tests for FindPlayersTab — the Social hub's Find Players subnav
 * container.
 *
 * FindPlayersTab is a thin container: it owns the search query + the shared
 * useDiscoverPlayers hook and wires profile navigation, then spreads everything
 * into the presentational FindPlayersBody (covered by its own suite). These
 * tests exercise the container's own logic in isolation by mocking both the
 * hook and the body:
 *   - Spreads the discover result + search state into FindPlayersBody.
 *   - onPlayerPress pushes the player profile route.
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

const mockUseDiscoverPlayers = jest.fn();

jest.mock('@/components/screens/FindPlayers/useDiscoverPlayers', () => ({
  useDiscoverPlayers: (opts: unknown) => mockUseDiscoverPlayers(opts),
}));

// Replace the body with a lightweight probe that surfaces the props the
// container hands down so we can assert wiring without rendering the real list.
jest.mock('@/components/screens/Social/FindPlayersBody', () => {
  const React = require('react');
  const { Pressable, Text, TextInput } = require('react-native');
  return {
    __esModule: true,
    default: (props: {
      searchQuery: string;
      setSearchQuery: (v: string) => void;
      onPlayerPress: (id: number) => void;
      players: readonly { player_id: number }[];
    }) => (
      <>
        <Text testID="body-search-value">{props.searchQuery}</Text>
        <Text testID="body-players-count">{String(props.players.length)}</Text>
        <TextInput
          testID="body-search-input"
          value={props.searchQuery}
          onChangeText={props.setSearchQuery}
        />
        <Pressable
          testID="body-player-press"
          onPress={() => props.onPlayerPress(99)}
        >
          <Text>player</Text>
        </Pressable>
      </>
    ),
  };
});

import FindPlayersTab from '@/components/screens/Social/FindPlayersTab';

const DISCOVER_RESULT = {
  players: [{ player_id: 5 }],
  isLoadingPlayers: false,
  playersError: null,
  isRefreshingPlayers: false,
  onRefreshPlayers: jest.fn(),
  onRetryPlayers: jest.fn(),
  onAddFriend: jest.fn(),
  pendingSendIds: new Set<number>(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDiscoverPlayers.mockReturnValue(DISCOVER_RESULT);
});

describe('FindPlayersTab', () => {
  it('spreads the discover result into FindPlayersBody', () => {
    render(<FindPlayersTab />);

    expect(mockUseDiscoverPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: '' }),
    );
    expect(screen.getByTestId('body-players-count').props.children).toBe('1');
  });

  it('pushes the player profile route on player press', () => {
    render(<FindPlayersTab />);

    fireEvent.press(screen.getByTestId('body-player-press'));

    expect(mockPush).toHaveBeenCalledWith('/(stack)/player/99');
  });

  it('updates the search query the body receives', () => {
    render(<FindPlayersTab />);

    fireEvent.changeText(screen.getByTestId('body-search-input'), 'nina');

    expect(screen.getByTestId('body-search-value').props.children).toBe('nina');
    expect(mockUseDiscoverPlayers).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchQuery: 'nina' }),
    );
  });
});
