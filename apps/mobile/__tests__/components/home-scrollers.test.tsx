/**
 * Tests for the richer home scrollers: SessionCard, RecentGamesScroll,
 * LeaguesScroll, and CourtsScroll.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

import SessionCard from '@/components/home/SessionCard';
import RecentGamesScroll from '@/components/home/RecentGamesScroll';
import LeaguesScroll from '@/components/home/LeaguesScroll';
import CourtsScroll from '@/components/home/CourtsScroll';

beforeEach(() => {
  mockPush.mockClear();
});

// ---------------------------------------------------------------------------
// SessionCard
// ---------------------------------------------------------------------------
describe('SessionCard', () => {
  const baseSession = {
    id: 7,
    season_id: 1,
    name: 'Monday Open',
    league_name: 'South Bay League',
    match_count: 3,
  };

  it('renders title, meta, and default match-count stat', () => {
    const { getByText } = render(
      <SessionCard session={baseSession as any} badgeLabel="LIVE" />,
    );
    expect(getByText('Monday Open')).toBeTruthy();
    expect(getByText('South Bay League')).toBeTruthy();
    expect(getByText('3 games')).toBeTruthy();
    expect(getByText('LIVE')).toBeTruthy();
  });

  it('singularises the default match-count stat when there is only one game', () => {
    const { getByText } = render(
      <SessionCard
        session={{ ...baseSession, match_count: 1 } as any}
        badgeLabel="LIVE"
      />,
    );
    expect(getByText('1 game')).toBeTruthy();
  });

  it('falls back to session code / id when no name is set', () => {
    const { getByText, rerender } = render(
      <SessionCard
        session={{ id: 9, season_id: 1, code: 'ABC123' } as any}
        badgeLabel="LEAGUE"
      />,
    );
    expect(getByText('ABC123')).toBeTruthy();

    rerender(
      <SessionCard
        session={{ id: 12, season_id: 1 } as any}
        badgeLabel="LEAGUE"
      />,
    );
    expect(getByText('Session #12')).toBeTruthy();
  });

  it('uses metaPrimary + metaSecondary overrides when provided', () => {
    const { getByText, queryByText } = render(
      <SessionCard
        session={baseSession as any}
        badgeLabel="LIVE"
        metaPrimary="Custom meta"
        metaSecondary={['Stat A', 'Stat B']}
      />,
    );
    expect(getByText('Custom meta')).toBeTruthy();
    expect(getByText('Stat A')).toBeTruthy();
    expect(getByText('Stat B')).toBeTruthy();
    // Default league_name should be overridden.
    expect(queryByText('South Bay League')).toBeNull();
  });

  it('navigates to the session route when pressed', () => {
    const { getByLabelText } = render(
      <SessionCard session={baseSession as any} badgeLabel="LIVE" />,
    );
    fireEvent.press(getByLabelText('Session Monday Open'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/session/7');
  });
});

// ---------------------------------------------------------------------------
// RecentGamesScroll
// ---------------------------------------------------------------------------
describe('RecentGamesScroll', () => {
  it('renders the empty-state card when there are no matches', () => {
    const { getByText } = render(<RecentGamesScroll matches={[]} />);
    expect(getByText('No games yet')).toBeTruthy();
  });

  it('renders a WIN card for result "W"', () => {
    const match = {
      id: 1,
      result: 'W',
      score: '21-18',
      partner: 'Ben',
      opponent_1: 'Chris',
      opponent_2: 'Dee',
      date: '2026-04-01',
      league_name: 'South Bay',
    };
    const { getByText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    expect(getByText('WIN')).toBeTruthy();
    expect(getByText('21-18')).toBeTruthy();
  });

  it('renders a LOSS card when result is not a win', () => {
    const match = { id: 2, result: 'L', score: '15-21' };
    const { getByText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    expect(getByText('LOSS')).toBeTruthy();
  });

  it('shows a Pending chip when session is pending or active', () => {
    const match = { id: 3, result: 'W', session_status: 'pending' };
    const { getByText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    expect(getByText('Pending')).toBeTruthy();
  });

  it('caps the number of visible cards at maxItems', () => {
    const matches = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      result: 'W',
      score: `21-${i}`,
    }));
    const { getAllByLabelText } = render(
      <RecentGamesScroll matches={matches as any} maxItems={3} />,
    );
    expect(getAllByLabelText(/^Win/).length).toBe(3);
  });

  it('navigates to my-stats when a game card is pressed', () => {
    const match = { id: 1, result: 'W', score: '21-18' };
    const { getByLabelText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    fireEvent.press(getByLabelText('Win 21-18'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/my-stats');
  });
});

// ---------------------------------------------------------------------------
// LeaguesScroll
// ---------------------------------------------------------------------------
describe('LeaguesScroll', () => {
  it('always renders the trailing "+ Join a League" card', () => {
    const { getByText } = render(<LeaguesScroll leagues={[]} />);
    expect(getByText('+ Join a League')).toBeTruthy();
  });

  it('pluralises member counts', () => {
    const leagues = [
      { id: 1, name: 'Solo', member_count: 1 },
      { id: 2, name: 'Crew', member_count: 7 },
    ];
    const { getByText } = render(<LeaguesScroll leagues={leagues as any} />);
    expect(getByText('1 player')).toBeTruthy();
    expect(getByText('7 players')).toBeTruthy();
  });

  it('shows the rank pill for the current user when a matching standings row exists', () => {
    const leagues = [
      {
        id: 1,
        name: 'Pro',
        member_count: 20,
        standings: [
          { player_id: 42, season_rank: 3 },
          { player_id: 77, season_rank: 1 },
        ],
      },
    ];
    const { getByText } = render(
      <LeaguesScroll leagues={leagues as any} currentUserPlayerId={42} />,
    );
    expect(getByText('3rd Ranked')).toBeTruthy();
  });

  it('hides the rank pill when no standings row matches the user', () => {
    const leagues = [
      {
        id: 1,
        name: 'Pro',
        member_count: 20,
        standings: [{ player_id: 77, season_rank: 1 }],
      },
    ];
    const { queryByText } = render(
      <LeaguesScroll leagues={leagues as any} currentUserPlayerId={42} />,
    );
    expect(queryByText(/Ranked$/)).toBeNull();
  });

  it('navigates to the league route when a card is pressed', () => {
    const leagues = [{ id: 9, name: 'Coastal', member_count: 4 }];
    const { getByLabelText } = render(
      <LeaguesScroll leagues={leagues as any} />,
    );
    fireEvent.press(getByLabelText('League Coastal'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/league/9');
  });

  it('navigates to find-leagues when the Join card is pressed', () => {
    const { getByLabelText } = render(<LeaguesScroll leagues={[]} />);
    fireEvent.press(getByLabelText('Join a league'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/find-leagues');
  });
});

// ---------------------------------------------------------------------------
// CourtsScroll
// ---------------------------------------------------------------------------
describe('CourtsScroll', () => {
  it('renders the empty-state card when there are no courts', () => {
    const { getByText } = render(<CourtsScroll courts={[]} />);
    expect(getByText('No courts found nearby')).toBeTruthy();
  });

  it('renders name + formatted location with distance', () => {
    const courts = [
      {
        id: 1,
        name: 'Ocean Park',
        city: 'Santa Monica',
        distance_miles: 2.35,
      },
    ];
    const { getByText } = render(<CourtsScroll courts={courts as any} />);
    expect(getByText('Ocean Park')).toBeTruthy();
    expect(getByText('Santa Monica · 2.4 mi')).toBeTruthy();
  });

  it('omits distance when not provided', () => {
    const courts = [{ id: 2, name: 'Dog Beach', city: 'Del Mar' }];
    const { getByText } = render(<CourtsScroll courts={courts as any} />);
    expect(getByText('Del Mar')).toBeTruthy();
  });

  it('navigates to the court route when a card is pressed', () => {
    const courts = [{ id: 5, name: 'Main St', city: 'SM' }];
    const { getByLabelText } = render(<CourtsScroll courts={courts as any} />);
    fireEvent.press(getByLabelText('Court Main St'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/court/5');
  });
});
