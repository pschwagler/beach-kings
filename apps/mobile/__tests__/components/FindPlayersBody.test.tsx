/**
 * Tests for FindPlayersBody — the Social hub's Find Players tab content.
 *
 * Covers:
 *   - Loading skeleton and full-page error state.
 *   - Empty state ("No Players Found"), with search-vs-idle copy.
 *   - Discover list rendering (PlayerRow per player).
 *   - Add-friend handler and optimistic pending state.
 *   - Player rows navigating to a profile.
 *   - Search input wiring.
 *   - No internal Players|Friends tab bar (discover-only slice).
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textTertiary: '#999999' }),
}));

import FindPlayersBody, {
  type FindPlayersBodyProps,
} from '@/components/screens/Social/FindPlayersBody';
import type { DiscoverPlayer } from '@/components/screens/FindPlayers/PlayerRow';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

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

const PLAYER_2: DiscoverPlayer = {
  player_id: 31,
  full_name: 'Riley Chen',
  avatar: null,
  city: 'Los Angeles, CA',
  level: 'AA',
  games_played: 4,
  mutual_friends_count: 0,
  last_active_label: null,
  friend_status: 'none',
};

function makeProps(
  overrides: Partial<FindPlayersBodyProps> = {},
): FindPlayersBodyProps {
  return {
    players: [PLAYER, PLAYER_2],
    isLoadingPlayers: false,
    playersError: null,
    isRefreshingPlayers: false,
    onRefreshPlayers: jest.fn(),
    onRetryPlayers: jest.fn(),
    onAddFriend: jest.fn(),
    pendingSendIds: new Set<number>(),
    searchQuery: '',
    setSearchQuery: jest.fn(),
    onPlayerPress: jest.fn(),
    levelFilter: null,
    sameLeagueOnly: false,
    sharedFriendsOnly: false,
    onToggleLevel: jest.fn(),
    onToggleSameLeague: jest.fn(),
    onToggleSharedFriends: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Loading / error
// ---------------------------------------------------------------------------

describe('FindPlayersBody — loading & error', () => {
  it('renders the loading skeleton while fetching', () => {
    render(<FindPlayersBody {...makeProps({ isLoadingPlayers: true })} />);
    expect(screen.getByTestId('find-players-loading')).toBeTruthy();
    expect(screen.queryByTestId('find-players-list')).toBeNull();
  });

  it('renders the full-page error state when discovery fails', () => {
    render(
      <FindPlayersBody {...makeProps({ playersError: new Error('boom') })} />,
    );
    expect(screen.getByTestId('find-players-error-state')).toBeTruthy();
  });

  it('retries discovery from the error state', () => {
    const onRetryPlayers = jest.fn();
    render(
      <FindPlayersBody
        {...makeProps({ playersError: new Error('boom'), onRetryPlayers })}
      />,
    );
    fireEvent.press(screen.getByTestId('find-players-retry-btn'));
    expect(onRetryPlayers).toHaveBeenCalledTimes(1);
  });

  it('still shows the list (not the skeleton) while refreshing', () => {
    render(
      <FindPlayersBody
        {...makeProps({ isLoadingPlayers: true, isRefreshingPlayers: true })}
      />,
    );
    expect(screen.getByTestId('find-players-list')).toBeTruthy();
    expect(screen.queryByTestId('find-players-loading')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

describe('FindPlayersBody — empty states', () => {
  it('renders the empty state with idle copy when there are no players', () => {
    render(<FindPlayersBody {...makeProps({ players: [] })} />);
    expect(screen.getByTestId('find-players-empty-state')).toBeTruthy();
    expect(screen.getByText(/new players join all the time/i)).toBeTruthy();
  });

  it('renders the empty state with search copy when a query returns nothing', () => {
    render(
      <FindPlayersBody {...makeProps({ players: [], searchQuery: 'zzz' })} />,
    );
    expect(screen.getByTestId('find-players-empty-state')).toBeTruthy();
    expect(screen.getByText(/adjusting your search/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

describe('FindPlayersBody — filter chips', () => {
  it('renders the full chip row', () => {
    render(<FindPlayersBody {...makeProps()} />);
    expect(screen.getByTestId('discover-chip-same-league')).toBeTruthy();
    expect(screen.getByTestId('discover-chip-shared-friends')).toBeTruthy();
    expect(screen.getByTestId('discover-chip-level-Open')).toBeTruthy();
    expect(screen.getByTestId('discover-chip-level-AA')).toBeTruthy();
    expect(screen.getByTestId('discover-chip-level-advanced')).toBeTruthy();
    expect(screen.getByTestId('discover-chip-level-intermediate')).toBeTruthy();
    expect(screen.getByTestId('discover-chip-level-beginner')).toBeTruthy();
  });

  it('toggles a level via the chip', () => {
    const onToggleLevel = jest.fn();
    render(<FindPlayersBody {...makeProps({ onToggleLevel })} />);
    fireEvent.press(screen.getByTestId('discover-chip-level-AA'));
    expect(onToggleLevel).toHaveBeenCalledWith('AA');
  });

  it('toggles the Same League and Shared Friends chips', () => {
    const onToggleSameLeague = jest.fn();
    const onToggleSharedFriends = jest.fn();
    render(
      <FindPlayersBody
        {...makeProps({ onToggleSameLeague, onToggleSharedFriends })}
      />,
    );
    fireEvent.press(screen.getByTestId('discover-chip-same-league'));
    expect(onToggleSameLeague).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('discover-chip-shared-friends'));
    expect(onToggleSharedFriends).toHaveBeenCalledTimes(1);
  });

  it('marks active chips as selected for accessibility', () => {
    render(
      <FindPlayersBody
        {...makeProps({ levelFilter: 'Open', sameLeagueOnly: true })}
      />,
    );
    expect(
      screen.getByTestId('discover-chip-level-Open').props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
    expect(
      screen.getByTestId('discover-chip-same-league').props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
    expect(
      screen.getByTestId('discover-chip-level-AA').props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: false }));
  });

  it('keeps the chip row visible in the empty state', () => {
    render(<FindPlayersBody {...makeProps({ players: [] })} />);
    expect(screen.getByTestId('discover-chip-same-league')).toBeTruthy();
    expect(screen.getByTestId('find-players-empty-state')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// List rendering
// ---------------------------------------------------------------------------

describe('FindPlayersBody — list', () => {
  it('renders a row per discoverable player', () => {
    render(<FindPlayersBody {...makeProps()} />);
    expect(screen.getByTestId('player-row-30')).toBeTruthy();
    expect(screen.getByTestId('player-row-31')).toBeTruthy();
  });

  it('does not render the standalone screen internal Players|Friends tab bar', () => {
    render(<FindPlayersBody {...makeProps()} />);
    expect(screen.queryByTestId('tab-players')).toBeNull();
    expect(screen.queryByTestId('tab-friends')).toBeNull();
  });

  it('navigates to a profile when a player row is pressed', () => {
    const onPlayerPress = jest.fn();
    render(<FindPlayersBody {...makeProps({ onPlayerPress })} />);
    fireEvent.press(screen.getByTestId('player-row-30'));
    expect(onPlayerPress).toHaveBeenCalledWith(30);
  });
});

// ---------------------------------------------------------------------------
// Add friend
// ---------------------------------------------------------------------------

describe('FindPlayersBody — add friend', () => {
  it('invokes onAddFriend when the Add button is pressed', () => {
    const onAddFriend = jest.fn();
    render(<FindPlayersBody {...makeProps({ onAddFriend })} />);
    fireEvent.press(screen.getByTestId('add-friend-btn-30'));
    expect(onAddFriend).toHaveBeenCalledWith(30);
  });

  it('shows the pending state for a player in pendingSendIds', () => {
    render(
      <FindPlayersBody {...makeProps({ pendingSendIds: new Set([30]) })} />,
    );
    expect(screen.getByTestId('pending-btn-30')).toBeTruthy();
    expect(screen.queryByTestId('add-friend-btn-30')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Search wiring
// ---------------------------------------------------------------------------

describe('FindPlayersBody — search', () => {
  it('forwards typed text to setSearchQuery', () => {
    const setSearchQuery = jest.fn();
    render(<FindPlayersBody {...makeProps({ setSearchQuery })} />);
    fireEvent.changeText(
      screen.getByTestId('find-players-search-input'),
      'morgan',
    );
    expect(setSearchQuery).toHaveBeenCalledWith('morgan');
  });

  it('reflects the current searchQuery value in the input', () => {
    render(<FindPlayersBody {...makeProps({ searchQuery: 'chen' })} />);
    expect(
      screen.getByTestId('find-players-search-input').props.value,
    ).toBe('chen');
  });
});
