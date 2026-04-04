/**
 * Unit tests for MatchCard component.
 *
 * Covers:
 * - Ranked badge shown for ranked matches
 * - Unranked badge shown for non-ranked, non-ranked-intent matches
 * - Pending badge shown when ranked_intent is true but is_ranked is false
 * - Pending badge tooltip identifies unregistered player(s) by name
 * - Pending badge tooltip is generic when all placeholder names are unavailable
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../../components/player/ShareInviteIcon', () => ({
  default: ({ playerName }: { playerName: string }) => (
    <span data-testid="share-invite">{playerName}</span>
  ),
}));

import MatchCard from '../MatchCard';

const baseMatch = {
  winner: 'Team 1',
  team_1_player_1: 'Alice',
  team_1_player_1_id: 1,
  team_1_player_1_is_placeholder: false,
  team_1_player_2: 'Bob',
  team_1_player_2_id: 2,
  team_1_player_2_is_placeholder: false,
  team_2_player_1: 'Carol',
  team_2_player_1_id: 3,
  team_2_player_1_is_placeholder: false,
  team_2_player_2: 'Dave',
  team_2_player_2_id: 4,
  team_2_player_2_is_placeholder: false,
  team_1_score: 21,
  team_2_score: 18,
  is_ranked: false,
  ranked_intent: false,
};

const noop = () => {};

describe('MatchCard', () => {
  describe('ranked badge', () => {
    it('shows Ranked badge when match is ranked', () => {
      render(
        <MatchCard
          match={{ ...baseMatch, is_ranked: true }}
          onPlayerClick={noop}
        />
      );
      expect(screen.getByText('Ranked')).toBeInTheDocument();
      expect(screen.queryByText('Pending')).not.toBeInTheDocument();
      expect(screen.queryByText('Unranked')).not.toBeInTheDocument();
    });

    it('shows Unranked badge when not ranked and no ranked_intent', () => {
      render(
        <MatchCard
          match={{ ...baseMatch, is_ranked: false, ranked_intent: false }}
          onPlayerClick={noop}
        />
      );
      expect(screen.getByText('Unranked')).toBeInTheDocument();
      expect(screen.queryByText('Ranked')).not.toBeInTheDocument();
      expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    });
  });

  describe('Pending badge', () => {
    it('shows Pending badge when ranked_intent is true but is_ranked is false', () => {
      render(
        <MatchCard
          match={{ ...baseMatch, is_ranked: false, ranked_intent: true }}
          onPlayerClick={noop}
        />
      );
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.queryByText('Ranked')).not.toBeInTheDocument();
      expect(screen.queryByText('Unranked')).not.toBeInTheDocument();
    });

    it('includes tooltip text on the Pending badge', () => {
      render(
        <MatchCard
          match={{ ...baseMatch, is_ranked: false, ranked_intent: true }}
          onPlayerClick={noop}
        />
      );
      const badge = screen.getByText('Pending');
      expect(badge).toHaveAttribute('data-tooltip');
      expect(badge.getAttribute('data-tooltip')).toContain('unregistered');
    });

    it('tooltip names the single unregistered placeholder player', () => {
      render(
        <MatchCard
          match={{
            ...baseMatch,
            is_ranked: false,
            ranked_intent: true,
            team_2_player_2: 'Ghost',
            team_2_player_2_is_placeholder: true,
          }}
          onPlayerClick={noop}
        />
      );
      const badge = screen.getByText('Pending');
      const tooltip = badge.getAttribute('data-tooltip') ?? '';
      expect(tooltip).toContain('Ghost');
    });

    it('tooltip names multiple unregistered placeholder players', () => {
      render(
        <MatchCard
          match={{
            ...baseMatch,
            is_ranked: false,
            ranked_intent: true,
            team_1_player_2: 'Ghost A',
            team_1_player_2_is_placeholder: true,
            team_2_player_1: 'Ghost B',
            team_2_player_1_is_placeholder: true,
          }}
          onPlayerClick={noop}
        />
      );
      const badge = screen.getByText('Pending');
      const tooltip = badge.getAttribute('data-tooltip') ?? '';
      expect(tooltip).toContain('Ghost A');
      expect(tooltip).toContain('Ghost B');
    });

    it('shows generic tooltip when no placeholder names are available', () => {
      render(
        <MatchCard
          match={{
            ...baseMatch,
            is_ranked: false,
            ranked_intent: true,
            team_1_player_1: '',
            team_1_player_1_is_placeholder: true,
          }}
          onPlayerClick={noop}
        />
      );
      const badge = screen.getByText('Pending');
      const tooltip = badge.getAttribute('data-tooltip') ?? '';
      expect(tooltip.length).toBeGreaterThan(0);
    });
  });

  describe('edit icon', () => {
    it('renders edit icon when showEdit and onEdit are provided', () => {
      const onEdit = vi.fn();
      render(
        <MatchCard match={baseMatch} onPlayerClick={noop} showEdit onEdit={onEdit} />
      );
      expect(screen.getByTestId('match-card')).toHaveClass('editable');
    });

    it('does not render edit icon by default', () => {
      render(<MatchCard match={baseMatch} onPlayerClick={noop} />);
      expect(screen.getByTestId('match-card')).not.toHaveClass('editable');
    });
  });
});
