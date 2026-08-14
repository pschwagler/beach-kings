/**
 * Tests for PlayerProfileErrorState — generic failure vs not-found variants.
 *
 * A 404 from GET /api/public/players/{id} is by-design (players with no games
 * are not publicly visible), so the not-found variant must not suggest a
 * connection problem nor offer a Retry that can never succeed.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import PlayerProfileErrorState from '@/components/screens/PlayerProfile/PlayerProfileErrorState';

describe('PlayerProfileErrorState', () => {
  it('renders the connection copy and a working Retry by default', () => {
    const onRetry = jest.fn();
    const { getByText, getByTestId } = render(
      <PlayerProfileErrorState onRetry={onRetry} />,
    );

    getByText('Could not load profile');
    getByText('Check your connection and try again.');
    fireEvent.press(getByTestId('player-profile-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders not-found copy without a Retry button when notFound', () => {
    const { getByText, queryByTestId, queryByText } = render(
      <PlayerProfileErrorState onRetry={jest.fn()} notFound />,
    );

    getByText('Profile not available');
    getByText("This player's profile isn't available yet.");
    expect(queryByText('Check your connection and try again.')).toBeNull();
    expect(queryByTestId('player-profile-retry-btn')).toBeNull();
  });
});
