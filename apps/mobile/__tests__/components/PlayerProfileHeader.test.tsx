/**
 * Tests for PlayerProfileHeader meta row — verifies the location/level
 * separator only renders when both are present, and that an empty-string
 * level is treated as absent (no dangling separator, no empty badge).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import PlayerProfileHeader from '@/components/screens/PlayerProfile/PlayerProfileHeader';

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textInverse: 'white', textDefault: 'black' }),
}));

const baseProps = {
  friendStatus: 'none' as const,
  isFriendActionLoading: false,
  onAddFriend: jest.fn(),
  onAcceptFriend: jest.fn(),
  onDeclineFriend: jest.fn(),
  onMessage: jest.fn(),
};

const player = (overrides: object) =>
  ({ id: 1, name: 'Test Player', city: 'New York', state: 'NY', ...overrides } as never);

describe('PlayerProfileHeader meta row', () => {
  it('renders the shared seeded avatar for the player identity', () => {
    render(<PlayerProfileHeader player={player({ level: 'Open' })} {...baseProps} />);
    expect(screen.getByText('TP')).toBeTruthy();
    expect(
      StyleSheet.flatten(screen.getByLabelText('Test Player').props.style).backgroundColor,
    ).toBeDefined();
  });

  it('renders a middot separator between location and level (not "--")', () => {
    render(<PlayerProfileHeader player={player({ level: 'Open' })} {...baseProps} />);
    expect(screen.getByText('New York, NY')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('·')).toBeTruthy();
    expect(screen.queryByText('--')).toBeNull();
  });

  it('treats an empty-string level as absent (no separator, no badge)', () => {
    render(<PlayerProfileHeader player={player({ level: '   ' })} {...baseProps} />);
    expect(screen.getByText('New York, NY')).toBeTruthy();
    expect(screen.queryByText('·')).toBeNull();
    expect(screen.queryByText('--')).toBeNull();
  });

  it('renders no separator when there is no level', () => {
    render(<PlayerProfileHeader player={player({})} {...baseProps} />);
    expect(screen.queryByText('·')).toBeNull();
  });
});
