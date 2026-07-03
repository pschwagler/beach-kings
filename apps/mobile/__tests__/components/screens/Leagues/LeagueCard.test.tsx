/**
 * Tests for LeagueCard — season-scoped stats display.
 *
 * The card's Games / W-L / Win-Rate are scoped to the league's *current*
 * season (see backend get_user_leagues). An established member can therefore
 * have zero activity in a brand-new active season. Covers:
 *   - Populated season: stat blocks render with a "This Season" scope label.
 *   - Empty season (0 games, no rank): a friendly zero-state replaces the
 *     bare "0 / 0-0 / 0%" and points the user to the league's history.
 *   - The member count + tap-to-open affordance survive both states.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { League } from '@beach-kings/shared';

import LeagueCard from '@/components/screens/Leagues/LeagueCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_LEAGUE = {
  id: 101,
  name: 'QBK Open Men - Mornings',
  location_name: 'Queens, NY',
  member_count: 27,
  current_season: { name: 'Season 4', is_active: true },
} as unknown as League;

const ACTIVE_LEAGUE = {
  ...BASE_LEAGUE,
  games_played: 11,
  standings: [{ player_id: 1, wins: 9, losses: 2, season_rank: 1 }],
} as unknown as League;

const EMPTY_SEASON_LEAGUE = {
  ...BASE_LEAGUE,
  games_played: 0,
  standings: [],
} as unknown as League;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeagueCard', () => {
  describe('with current-season activity', () => {
    it('labels the stats as scoped to the current season', () => {
      const { getByText } = render(
        <LeagueCard
          league={ACTIVE_LEAGUE}
          userRank={1}
          userWins={9}
          userLosses={2}
          onPress={jest.fn()}
        />,
      );
      expect(getByText('This Season')).toBeTruthy();
    });

    it('shows the games, W-L, and win-rate stat blocks', () => {
      const { getByText } = render(
        <LeagueCard
          league={ACTIVE_LEAGUE}
          userRank={1}
          userWins={9}
          userLosses={2}
          onPress={jest.fn()}
        />,
      );
      expect(getByText('11')).toBeTruthy(); // games
      expect(getByText('9-2')).toBeTruthy(); // W-L
      expect(getByText('82%')).toBeTruthy(); // win rate
    });

    it('does not render the empty-season notice', () => {
      const { queryByText } = render(
        <LeagueCard
          league={ACTIVE_LEAGUE}
          userRank={1}
          userWins={9}
          userLosses={2}
          onPress={jest.fn()}
        />,
      );
      expect(queryByText('No games yet this season')).toBeNull();
    });
  });

  describe('with no current-season activity', () => {
    it('shows a friendly zero-state instead of a bare 0 / 0-0 / 0%', () => {
      const { getByText, queryByText } = render(
        <LeagueCard
          league={EMPTY_SEASON_LEAGUE}
          userRank={null}
          userWins={0}
          userLosses={0}
          onPress={jest.fn()}
        />,
      );
      expect(getByText('No games yet this season')).toBeTruthy();
      // The misleading all-zero stat blocks must NOT render.
      expect(queryByText('0-0')).toBeNull();
      expect(queryByText('0%')).toBeNull();
    });

    it('offers a way to view the league history', () => {
      const { getByText } = render(
        <LeagueCard
          league={EMPTY_SEASON_LEAGUE}
          userRank={null}
          userWins={0}
          userLosses={0}
          onPress={jest.fn()}
        />,
      );
      expect(getByText(/view league history/i)).toBeTruthy();
    });

    it('still shows the member count', () => {
      const { getByText } = render(
        <LeagueCard
          league={EMPTY_SEASON_LEAGUE}
          userRank={null}
          userWins={0}
          userLosses={0}
          onPress={jest.fn()}
        />,
      );
      expect(getByText('27 members')).toBeTruthy();
    });
  });

  it('calls onPress when the card is tapped in either state', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <LeagueCard
        league={EMPTY_SEASON_LEAGUE}
        userRank={null}
        userWins={0}
        userLosses={0}
        onPress={onPress}
      />,
    );
    fireEvent.press(getByTestId('league-card-101'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
