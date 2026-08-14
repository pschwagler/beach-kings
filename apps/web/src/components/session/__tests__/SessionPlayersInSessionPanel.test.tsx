/**
 * Unit tests for SessionPlayersInSessionPanel friend button rendering.
 *
 * Covers:
 * - "Add Friend" button rendered for non-friend, non-self, non-placeholder participants
 * - "Friends" badge rendered when status is 'friend'
 * - "Pending" badge rendered when status is 'pending_outgoing' or 'pending_incoming'
 * - No friend button for self (currentUserPlayerId)
 * - No friend button for placeholder participants
 * - No friend buttons before friendStatusesLoaded
 * - onAddFriend called with correct player_id on click
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('lucide-react', () => ({
  X: ({ size }: { size: number }) => <span data-testid="icon-x">{size}</span>,
  MapPin: ({ size }: { size: number }) => <span data-testid="icon-map-pin">{size}</span>,
  UserPlus: ({ size }: { size: number }) => <span data-testid="icon-user-plus">{size}</span>,
  Check: ({ size }: { size: number }) => <span data-testid="icon-check">{size}</span>,
  Clock: ({ size }: { size: number }) => <span data-testid="icon-clock">{size}</span>,
}));

vi.mock('../../../utils/divisionUtils', () => ({
  formatDivisionLabel: (gender?: string | null, level?: string | null) =>
    [gender, level].filter(Boolean).join(' ') || '',
}));

import SessionPlayersInSessionPanel from '../SessionPlayersInSessionPanel';

const alice = { player_id: 1, full_name: 'Alice', gender: 'F', level: 'A' };
const bob = { player_id: 2, full_name: 'Bob', gender: 'M', level: 'B' };
const carol = { player_id: 3, full_name: 'Carol', gender: 'F', level: 'AA' };
const placeholder = { player_id: 4, full_name: 'Ghost Player', is_placeholder: true };

const noop = () => {};

describe('SessionPlayersInSessionPanel', () => {
  describe('friend buttons', () => {
    it('renders "Add Friend" for non-friend, non-self participant when statuses loaded', () => {
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, bob]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '2': 'none' }}
          friendStatusesLoaded={true}
          onAddFriend={noop}
        />
      );
      expect(screen.getByRole('button', { name: /Add Bob as friend/i })).toBeInTheDocument();
    });

    it('renders "Friends" badge when status is friend', () => {
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, bob]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '2': 'friend' }}
          friendStatusesLoaded={true}
          onAddFriend={noop}
        />
      );
      expect(screen.getByTitle('Friends')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add Bob as friend/i })).not.toBeInTheDocument();
    });

    it('renders "Pending" badge when status is pending_outgoing', () => {
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, bob]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '2': 'pending_outgoing' }}
          friendStatusesLoaded={true}
          onAddFriend={noop}
        />
      );
      expect(screen.getByTitle('Friend request pending')).toBeInTheDocument();
    });

    it('renders "Pending" badge when status is pending_incoming', () => {
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, bob]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '2': 'pending_incoming' }}
          friendStatusesLoaded={true}
          onAddFriend={noop}
        />
      );
      expect(screen.getByTitle('Friend request pending')).toBeInTheDocument();
    });

    it('does not render friend button for self', () => {
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, bob]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '1': 'none', '2': 'none' }}
          friendStatusesLoaded={true}
          onAddFriend={noop}
        />
      );
      expect(screen.queryByRole('button', { name: /Add Alice as friend/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add Bob as friend/i })).toBeInTheDocument();
    });

    it('does not render friend button for placeholder participants', () => {
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, placeholder]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '4': 'none' }}
          friendStatusesLoaded={true}
          onAddFriend={noop}
        />
      );
      expect(screen.queryByRole('button', { name: /Add Ghost Player as friend/i })).not.toBeInTheDocument();
    });

    it('does not render any friend buttons before statuses are loaded', () => {
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, bob, carol]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '2': 'none', '3': 'friend' }}
          friendStatusesLoaded={false}
          onAddFriend={noop}
        />
      );
      expect(screen.queryByRole('button', { name: /Add .* as friend/i })).not.toBeInTheDocument();
      expect(screen.queryByTitle('Friends')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Friend request pending')).not.toBeInTheDocument();
    });

    it('calls onAddFriend with correct player_id on click', async () => {
      const user = userEvent.setup();
      const onAddFriend = vi.fn();
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, bob]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '2': 'none' }}
          friendStatusesLoaded={true}
          onAddFriend={onAddFriend}
        />
      );
      await user.click(screen.getByRole('button', { name: /Add Bob as friend/i }));
      expect(onAddFriend).toHaveBeenCalledWith(2);
      expect(onAddFriend).toHaveBeenCalledTimes(1);
    });

    it('does not render friend buttons when onAddFriend is not provided', () => {
      render(
        <SessionPlayersInSessionPanel
          participants={[alice, bob]}
          currentUserPlayerId={1}
          onRemove={noop}
          friendStatuses={{ '2': 'none' }}
          friendStatusesLoaded={true}
        />
      );
      expect(screen.queryByRole('button', { name: /Add Bob as friend/i })).not.toBeInTheDocument();
    });
  });
});
