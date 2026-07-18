import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { Player } from '@beach-kings/shared';
import PlayerProfileHeader from '../PlayerProfileHeader';

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textInverse: 'white', textDefault: 'black' }),
}));

const player = {
  id: 42,
  first_name: 'Alice',
  last_name: 'Smith',
  name: 'Alice Smith',
  city: 'Queens',
  state: 'NY',
  level: 'Open',
  profile_picture_url: null,
  is_placeholder: false,
} as Player;

const baseProps = {
  player,
  isFriendActionLoading: false,
  onAddFriend: jest.fn(),
  onAcceptFriend: jest.fn(),
  onDeclineFriend: jest.fn(),
  onMessage: jest.fn(),
};

describe('PlayerProfileHeader relationship actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows Accept and Decline for an incoming request', () => {
    const view = render(
      <PlayerProfileHeader {...baseProps} friendStatus="pending_incoming" />,
    );

    fireEvent.press(view.getByTestId('player-accept-friend-btn'));
    fireEvent.press(view.getByTestId('player-decline-friend-btn'));
    expect(baseProps.onAcceptFriend).toHaveBeenCalledTimes(1);
    expect(baseProps.onDeclineFriend).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Add Friend')).toBeNull();
  });

  it('never offers Add Friend to a confirmed friend', () => {
    const view = render(
      <PlayerProfileHeader {...baseProps} friendStatus="friend" />,
    );
    expect(view.getByText('Friends')).toBeTruthy();
    expect(view.queryByText('Add Friend')).toBeNull();
  });

  it('labels an outgoing request as sent', () => {
    const view = render(
      <PlayerProfileHeader {...baseProps} friendStatus="pending_outgoing" />,
    );
    expect(view.getByText('Request sent')).toBeTruthy();
  });
});
