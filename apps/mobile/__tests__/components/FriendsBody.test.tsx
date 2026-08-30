/**
 * Tests for FriendsBody — the Social hub's Friends tab content.
 *
 * Covers:
 *   - Loading skeleton and full-page error state.
 *   - Empty state ("No friends yet" + Find Players CTA) and its navigation.
 *   - "No matches" state while searching with no results.
 *   - Sectioned rendering: Pending requests / Friends / Suggested players
 *     with correct counts.
 *   - Accept / decline request handlers.
 *   - Suggestion add handler and the pending ("Requested") state.
 *   - Friend + suggestion rows navigating to a profile.
 *   - Non-fatal inline notice when the friend-requests fetch fails.
 *   - Search input wiring, and search scoping (requests/suggestions hidden while
 *     searching so a no-match search reads as "No matches").
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

import FriendsBody, {
  type FriendsBodyProps,
} from '@/components/screens/Social/FriendsBody';
import type { Friend, FriendRequest } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const FRIEND: Friend = {
  id: 1,
  player_id: 30,
  full_name: 'Morgan Davis',
  avatar: null,
  location_name: 'San Diego, CA',
  level: 'Open',
  shared_league_name: null,
};

const FRIEND_2: Friend = {
  id: 2,
  player_id: 31,
  full_name: 'Riley Chen',
  avatar: null,
  location_name: 'Los Angeles, CA',
  level: 'AA',
  shared_league_name: null,
};

const REQUEST: FriendRequest = {
  id: 100,
  sender_player_id: 50,
  sender_name: 'Alex Torres',
  sender_avatar: null,
  receiver_player_id: 0,
  receiver_name: 'Me',
  receiver_avatar: null,
  status: 'pending',
  created_at: '2026-04-19T10:00:00Z',
  mutual_friends_count: 0,
  shared_league_name: null,
};

const SUGGESTION: Friend = {
  id: 3,
  player_id: 40,
  full_name: 'Sam Rivera',
  avatar: null,
  location_name: 'San Diego, CA',
  level: 'advanced',
  shared_league_name: null,
};

function makeProps(overrides: Partial<FriendsBodyProps> = {}): FriendsBodyProps {
  return {
    friends: [FRIEND, FRIEND_2],
    friendRequests: [REQUEST],
    suggestions: [SUGGESTION],
    isLoadingFriends: false,
    isLoadingSuggestions: false,
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
    searchQuery: '',
    setSearchQuery: jest.fn(),
    onPlayerPress: jest.fn(),
    onMessagePress: jest.fn(),
    onFindPlayers: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Loading / error
// ---------------------------------------------------------------------------

describe('FriendsBody — loading & error', () => {
  it('renders the loading skeleton while fetching', () => {
    render(<FriendsBody {...makeProps({ isLoadingFriends: true })} />);
    expect(screen.getByTestId('friends-loading')).toBeTruthy();
    expect(screen.queryByTestId('friends-list')).toBeNull();
  });

  it('renders friends and requests while suggestions are still loading', () => {
    render(
      <FriendsBody
        {...makeProps({ suggestions: [], isLoadingSuggestions: true })}
      />,
    );
    expect(screen.getByTestId('friends-list')).toBeTruthy();
    expect(screen.getByText('Morgan Davis')).toBeTruthy();
    expect(screen.queryByTestId('friends-loading')).toBeNull();
    expect(screen.queryByText('Suggested players')).toBeNull();
  });

  it('keeps the skeleton while suggestions load and nothing else has content', () => {
    render(
      <FriendsBody
        {...makeProps({
          friends: [],
          friendRequests: [],
          suggestions: [],
          isLoadingSuggestions: true,
        })}
      />,
    );
    expect(screen.getByTestId('friends-loading')).toBeTruthy();
    expect(screen.queryByTestId('friends-empty-state')).toBeNull();
  });

  it('renders the full-page error state when the friends list fails', () => {
    render(
      <FriendsBody
        {...makeProps({ friendsError: new Error('boom') })}
      />,
    );
    expect(screen.getByTestId('friends-error-state')).toBeTruthy();
  });

  it('retries from the error state', () => {
    const onRetryFriends = jest.fn();
    render(
      <FriendsBody
        {...makeProps({ friendsError: new Error('boom'), onRetryFriends })}
      />,
    );
    fireEvent.press(screen.getByTestId('friends-retry-btn'));
    expect(onRetryFriends).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

describe('FriendsBody — empty states', () => {
  it('renders the empty state when there is no data', () => {
    render(
      <FriendsBody
        {...makeProps({ friends: [], friendRequests: [], suggestions: [] })}
      />,
    );
    expect(screen.getByTestId('friends-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('friends-list')).toBeNull();
  });

  it('navigates to Find Players from the empty-state CTA', () => {
    const onFindPlayers = jest.fn();
    render(
      <FriendsBody
        {...makeProps({
          friends: [],
          friendRequests: [],
          suggestions: [],
          onFindPlayers,
        })}
      />,
    );
    fireEvent.press(screen.getByTestId('friends-empty-find-players'));
    expect(onFindPlayers).toHaveBeenCalled();
  });

  it('shows a "no matches" state when searching yields nothing', () => {
    render(
      <FriendsBody
        {...makeProps({
          friends: [],
          friendRequests: [],
          suggestions: [],
          searchQuery: 'zzz',
        })}
      />,
    );
    expect(screen.getByTestId('friends-no-results')).toBeTruthy();
    expect(screen.queryByTestId('friends-empty-state')).toBeNull();
  });

  it('shows "no matches" while searching even when requests/suggestions exist', () => {
    // friends filtered to empty, but requests + suggestions are still populated.
    render(
      <FriendsBody {...makeProps({ friends: [], searchQuery: 'zzz' })} />,
    );
    expect(screen.getByTestId('friends-no-results')).toBeTruthy();
    expect(screen.queryByText(/Pending requests/)).toBeNull();
    expect(screen.queryByText('Suggested players')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Search scoping
// ---------------------------------------------------------------------------

describe('FriendsBody — search scoping', () => {
  it('hides requests + suggestions while searching, keeping only friends', () => {
    render(<FriendsBody {...makeProps({ searchQuery: 'morgan' })} />);

    expect(screen.getByText('Friends · 2')).toBeTruthy();
    expect(screen.getByTestId(`friend-row-${FRIEND.player_id}`)).toBeTruthy();
    expect(screen.queryByText(/Pending requests/)).toBeNull();
    expect(screen.queryByText('Suggested players')).toBeNull();
    expect(
      screen.queryByTestId(`friend-request-card-${REQUEST.id}`),
    ).toBeNull();
  });

  it('suppresses the requests-error notice while searching', () => {
    render(
      <FriendsBody
        {...makeProps({
          searchQuery: 'morgan',
          friendRequests: [],
          friendRequestsError: new Error('requests boom'),
        })}
      />,
    );

    expect(screen.queryByTestId('friend-requests-error-notice')).toBeNull();
    expect(screen.getByText('Friends · 2')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

describe('FriendsBody — sections', () => {
  it('renders all three sections with counts', () => {
    render(<FriendsBody {...makeProps()} />);

    expect(screen.getByText('Pending requests · 1')).toBeTruthy();
    expect(screen.getByText('Friends · 2')).toBeTruthy();
    expect(screen.getByText('Suggested players')).toBeTruthy();
  });

  it('renders friend, request, and suggestion rows', () => {
    render(<FriendsBody {...makeProps()} />);

    expect(screen.getByTestId(`friend-request-card-${REQUEST.id}`)).toBeTruthy();
    expect(screen.getByTestId(`friend-row-${FRIEND.player_id}`)).toBeTruthy();
    expect(
      screen.getByTestId(`suggestion-row-${SUGGESTION.player_id}`),
    ).toBeTruthy();
  });

  it('shows the mutual-friend count on a request card', () => {
    render(
      <FriendsBody
        {...makeProps({
          friendRequests: [{ ...REQUEST, mutual_friends_count: 3 }],
        })}
      />,
    );

    expect(screen.getByText('3 mutual friends')).toBeTruthy();
    expect(screen.queryByText('Wants to be friends')).toBeNull();
  });

  it('singularizes a single mutual friend', () => {
    render(
      <FriendsBody
        {...makeProps({
          friendRequests: [{ ...REQUEST, mutual_friends_count: 1 }],
        })}
      />,
    );

    expect(screen.getByText('1 mutual friend')).toBeTruthy();
  });

  it('falls back to the generic meta line with no mutual friends', () => {
    render(<FriendsBody {...makeProps()} />);

    expect(screen.getByText('Wants to be friends')).toBeTruthy();
  });

  it('prefixes the request meta with the shared league', () => {
    render(
      <FriendsBody
        {...makeProps({
          friendRequests: [
            {
              ...REQUEST,
              shared_league_name: 'QBK Open Men',
              mutual_friends_count: 3,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('QBK Open Men · 3 mutual friends')).toBeTruthy();
  });

  it('shows the shared league alone when there are no mutual friends', () => {
    render(
      <FriendsBody
        {...makeProps({
          friendRequests: [
            { ...REQUEST, shared_league_name: 'QBK Open Men' },
          ],
        })}
      />,
    );

    expect(screen.getByText('QBK Open Men')).toBeTruthy();
    expect(screen.queryByText('Wants to be friends')).toBeNull();
  });

  it('prefixes the friend row meta with the shared league', () => {
    render(
      <FriendsBody
        {...makeProps({
          friends: [{ ...FRIEND, shared_league_name: 'QBK Open Men' }],
        })}
      />,
    );

    expect(
      screen.getByText('QBK Open Men · San Diego, CA'),
    ).toBeTruthy();
  });

  it('shows "Active today" on a friend active within 24h', () => {
    render(
      <FriendsBody
        {...makeProps({
          friends: [{ ...FRIEND, last_active: new Date().toISOString() }],
        })}
      />,
    );

    expect(screen.getByText('Active today')).toBeTruthy();
  });

  it('shows "Nd ago" for older activity and nothing when absent', () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    render(
      <FriendsBody
        {...makeProps({
          friends: [
            { ...FRIEND, last_active: threeDaysAgo },
            FRIEND_2, // no last_active — no label
          ],
        })}
      />,
    );

    expect(screen.getByText('3d ago')).toBeTruthy();
    expect(screen.queryByText('Active today')).toBeNull();
  });

  it('omits sections that have no items', () => {
    render(
      <FriendsBody {...makeProps({ friendRequests: [], suggestions: [] })} />,
    );

    expect(screen.queryByText(/Pending requests/)).toBeNull();
    expect(screen.queryByText('Suggested players')).toBeNull();
    expect(screen.getByText('Friends · 2')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('FriendsBody — request actions', () => {
  it('accepts a request', () => {
    const onAcceptRequest = jest.fn();
    render(<FriendsBody {...makeProps({ onAcceptRequest })} />);

    fireEvent.press(screen.getByTestId(`accept-request-btn-${REQUEST.id}`));
    expect(onAcceptRequest).toHaveBeenCalledWith(REQUEST.id);
  });

  it('declines a request', () => {
    const onDeclineRequest = jest.fn();
    render(<FriendsBody {...makeProps({ onDeclineRequest })} />);

    fireEvent.press(screen.getByTestId(`decline-request-btn-${REQUEST.id}`));
    expect(onDeclineRequest).toHaveBeenCalledWith(REQUEST.id);
  });
});

describe('FriendsBody — suggestions', () => {
  it('adds a suggestion', () => {
    const onAddSuggestion = jest.fn();
    render(<FriendsBody {...makeProps({ onAddSuggestion })} />);

    fireEvent.press(screen.getByTestId(`suggestion-add-btn-${SUGGESTION.player_id}`));
    expect(onAddSuggestion).toHaveBeenCalledWith(SUGGESTION.player_id);
  });

  it('shows the pending pill for an in-flight suggestion', () => {
    render(
      <FriendsBody
        {...makeProps({ pendingAddIds: new Set([SUGGESTION.player_id]) })}
      />,
    );

    expect(
      screen.getByTestId(`suggestion-pending-${SUGGESTION.player_id}`),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(`suggestion-add-btn-${SUGGESTION.player_id}`),
    ).toBeNull();
  });
});

describe('FriendsBody — navigation', () => {
  it('opens a friend profile on row press', () => {
    const onPlayerPress = jest.fn();
    render(<FriendsBody {...makeProps({ onPlayerPress })} />);

    fireEvent.press(screen.getByTestId(`friend-row-${FRIEND.player_id}`));
    expect(onPlayerPress).toHaveBeenCalledWith(FRIEND.player_id);
  });

  it('opens a separate message action for an eligible friend', () => {
    const onMessagePress = jest.fn();
    render(<FriendsBody {...makeProps({ onMessagePress })} />);

    fireEvent.press(screen.getByTestId(`friend-message-${FRIEND.player_id}`));
    expect(onMessagePress).toHaveBeenCalledWith(
      FRIEND.player_id,
      FRIEND.full_name,
    );
  });

  it('disables the message action when contact is restricted', () => {
    const onMessagePress = jest.fn();
    const restrictedFriend: Friend = {
      ...FRIEND,
      capability: {
        actions: {
          direct_message: false,
          friend_request: false,
          league_invite: false,
          session_invite: false,
          mention: false,
          reply: false,
          presence: false,
          read_receipt: false,
          notification: false,
          discovery: false,
          user_generated_content: false,
          shared_operational_content: false,
        },
        blocked_by_viewer: false,
        viewer_restricted: false,
      },
    };
    render(
      <FriendsBody
        {...makeProps({ friends: [restrictedFriend], onMessagePress })}
      />,
    );

    fireEvent.press(
      screen.getByTestId(`friend-message-${restrictedFriend.player_id}`),
    );
    expect(onMessagePress).not.toHaveBeenCalled();
    expect(
      screen.getByTestId(`friend-message-${restrictedFriend.player_id}`).props
        .accessibilityState,
    ).toEqual({ disabled: true });
  });

  it('opens a suggested player profile on row press', () => {
    const onPlayerPress = jest.fn();
    render(<FriendsBody {...makeProps({ onPlayerPress })} />);

    fireEvent.press(screen.getByTestId(`suggestion-row-${SUGGESTION.player_id}`));
    expect(onPlayerPress).toHaveBeenCalledWith(SUGGESTION.player_id);
  });

  it('opens the requester profile on sender press', () => {
    const onPlayerPress = jest.fn();
    render(<FriendsBody {...makeProps({ onPlayerPress })} />);

    fireEvent.press(screen.getByTestId(`friend-request-sender-${REQUEST.id}`));
    expect(onPlayerPress).toHaveBeenCalledWith(REQUEST.sender_player_id);
  });
});

// ---------------------------------------------------------------------------
// Non-fatal request error + search
// ---------------------------------------------------------------------------

describe('FriendsBody — non-fatal request error', () => {
  it('shows an inline notice but still renders friends when requests fail', () => {
    render(
      <FriendsBody
        {...makeProps({
          friendRequests: [],
          friendRequestsError: new Error('requests boom'),
        })}
      />,
    );

    expect(screen.getByTestId('friend-requests-error-notice')).toBeTruthy();
    expect(screen.getByTestId('friends-list')).toBeTruthy();
    expect(screen.getByTestId(`friend-row-${FRIEND.player_id}`)).toBeTruthy();
  });

  it('retries requests from the inline notice', () => {
    const onRetryFriends = jest.fn();
    render(
      <FriendsBody
        {...makeProps({
          friendRequests: [],
          friendRequestsError: new Error('requests boom'),
          onRetryFriends,
        })}
      />,
    );

    fireEvent.press(screen.getByTestId('friend-requests-error-retry'));
    expect(onRetryFriends).toHaveBeenCalled();
  });
});

describe('FriendsBody — search', () => {
  it('wires the search input to setSearchQuery', () => {
    const setSearchQuery = jest.fn();
    render(<FriendsBody {...makeProps({ setSearchQuery })} />);

    fireEvent.changeText(
      screen.getByTestId('friends-search-input'),
      'riley',
    );
    expect(setSearchQuery).toHaveBeenCalledWith('riley');
  });
});
