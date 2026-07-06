/**
 * Tests for PlayerRow — a single player card in the Find Players list.
 *
 * Covers the avatar contract (interactions are covered by the
 * FindPlayersBody suite):
 *   - Identity avatar seeded by player_id (variety color, per the Avatar
 *     convention for player-identity avatars).
 *   - Real profile photo rendering when the player has an avatar URL.
 *   - Initials fallback content.
 */

import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));

import PlayerRow, {
  type DiscoverPlayer,
} from '@/components/screens/FindPlayers/PlayerRow';

const PLAYER: DiscoverPlayer = {
  player_id: 30,
  full_name: 'Morgan Davis',
  avatar: null,
  city: 'San Diego, CA',
  level: 'Open',
  games_played: 12,
  mutual_friends_count: 2,
  last_active_label: null,
  friend_status: 'none',
};

function renderRow(player: DiscoverPlayer = PLAYER): void {
  render(
    <PlayerRow
      player={player}
      onPress={jest.fn()}
      onAddFriend={jest.fn()}
      isPendingSend={false}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PlayerRow avatar', () => {
  it('renders the initials fallback when the player has no photo', () => {
    renderRow();
    expect(screen.getByText('MD')).toBeTruthy();
  });

  it('seeds the avatar variety color from player_id', () => {
    renderRow();
    // player_id 30 % 6 === 0 → first variety entry ({ bg: #bae6fd, fg: #0c4a6e }).
    expect(StyleSheet.flatten(screen.getByText('MD').props.style)).toEqual(
      expect.objectContaining({ color: '#0c4a6e' }),
    );
  });

  it('renders the profile photo when the player has an avatar URL', () => {
    renderRow({ ...PLAYER, avatar: 'https://example.com/a.jpg' });
    expect(screen.UNSAFE_getByType(Image).props.source).toEqual({
      uri: 'https://example.com/a.jpg',
    });
    expect(screen.queryByText('MD')).toBeNull();
  });
});
