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
  usePaletteColors: () => ({
    textTertiary: '#999999',
    textDefault: '#111111',
    brandTeal: '#005555',
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
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
    locations: [
      {
        id: 'socal_sd',
        name: 'San Diego',
        city: 'San Diego',
        state: 'CA',
        latitude: 32.72,
        longitude: -117.16,
      },
    ],
    locationsPending: false,
    locationsError: null,
    onRetryLocations: jest.fn(),
    metroFilterId: null,
    nearMeEnabled: false,
    nearMePending: false,
    nearMeDenied: false,
    nearMeUnavailable: false,
    nearMeOriginLabel: null,
    radiusMiles: 25,
    onSelectMetro: jest.fn(),
    onSelectNearMe: jest.fn(),
    onSetRadius: jest.fn(),
    onClearLocation: jest.fn(),
    hasLocationFilter: false,
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
    expect(screen.getByTestId('discover-location-controls')).toBeTruthy();
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

  it('requests Near Me only from the explicit control', () => {
    const onSelectNearMe = jest.fn();
    render(<FindPlayersBody {...makeProps({ onSelectNearMe })} />);

    expect(onSelectNearMe).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('discover-near-me'));
    expect(onSelectNearMe).toHaveBeenCalledTimes(1);
  });

  it('selects and clears an exact metro from the catalog control', () => {
    const onSelectMetro = jest.fn();
    const view = render(
      <FindPlayersBody {...makeProps({ onSelectMetro })} />,
    );

    fireEvent.press(screen.getByTestId('discover-metro-select'));
    fireEvent.press(screen.getByText('San Diego'));
    expect(onSelectMetro).toHaveBeenCalledWith('socal_sd');

    view.rerender(
      <FindPlayersBody
        {...makeProps({ metroFilterId: 'socal_sd', onSelectMetro })}
      />,
    );
    fireEvent.press(screen.getByTestId('discover-metro-select'));
    fireEvent.press(screen.getByText('All metros'));
    expect(onSelectMetro).toHaveBeenLastCalledWith(null);
  });

  it('shows every approved radius and updates the selected radius', () => {
    const onSetRadius = jest.fn();
    render(
      <FindPlayersBody
        {...makeProps({
          nearMeEnabled: true,
          nearMeOriginLabel: 'San Diego',
          onSetRadius,
        })}
      />,
    );

    expect(screen.getByText('Near San Diego')).toBeTruthy();
    expect(screen.getByTestId('discover-radius-10')).toBeTruthy();
    expect(screen.getByTestId('discover-radius-25')).toBeTruthy();
    expect(screen.getByTestId('discover-radius-50')).toBeTruthy();
    fireEvent.press(screen.getByTestId('discover-radius-100'));
    expect(onSetRadius).toHaveBeenCalledWith(100);
  });

  it('shows permission denial with a usable metro selector fallback', () => {
    render(
      <FindPlayersBody
        {...makeProps({ nearMeEnabled: true, nearMeDenied: true })}
      />,
    );

    expect(screen.getByText(/choose a metro to keep filtering/i)).toBeTruthy();
    expect(screen.getByTestId('discover-metro-select')).toBeTruthy();
    expect(screen.getByTestId('find-players-near-me-denied')).toBeTruthy();
    expect(screen.queryByTestId('player-row-30')).toBeNull();
    expect(screen.queryByTestId('find-players-empty-state')).toBeNull();
  });

  it('hides stale players behind an explicit Near Me resolving state', () => {
    render(
      <FindPlayersBody
        {...makeProps({ nearMeEnabled: true, nearMePending: true })}
      />,
    );

    expect(screen.getByTestId('find-players-near-me-resolving')).toBeTruthy();
    expect(screen.queryByTestId('player-row-30')).toBeNull();
    expect(screen.queryByTestId('find-players-empty-state')).toBeNull();
  });

  it('renders a dedicated unavailable state instead of generic empty results', () => {
    render(
      <FindPlayersBody
        {...makeProps({
          nearMeEnabled: true,
          nearMeUnavailable: true,
          locationsError: new Error('offline'),
        })}
      />,
    );

    expect(screen.getByTestId('find-players-near-me-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('player-row-30')).toBeNull();
    expect(screen.queryByTestId('find-players-empty-state')).toBeNull();
  });

  it('retries a section-local metro catalog failure', () => {
    const onRetryLocations = jest.fn();
    render(
      <FindPlayersBody
        {...makeProps({
          locationsError: new Error('offline'),
          onRetryLocations,
        })}
      />,
    );

    fireEvent.press(screen.getByTestId('discover-location-retry'));
    expect(onRetryLocations).toHaveBeenCalledTimes(1);
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
    expect(screen.getByTestId('relationship-status-30').props.accessibilityRole).toBeUndefined();
    expect(
      screen.getByTestId('relationship-status-30').props.accessibilityLabel,
    ).toBe('Relationship status: Request sent');
    expect(screen.getByText('Request sent')).toBeTruthy();
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
