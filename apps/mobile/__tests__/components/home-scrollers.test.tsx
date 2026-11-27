/**
 * Tests for the Home recent-games, leagues, and courts collections.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

import RecentGamesScroll from '@/components/home/RecentGamesScroll';
import LeaguesScroll from '@/components/home/LeaguesScroll';
import CourtsScroll from '@/components/home/CourtsScroll';

const useWindowDimensionsSpy = jest.spyOn(require('react-native'), 'useWindowDimensions');
const defaultDimensions = { width: 393, height: 852, scale: 3, fontScale: 1 };

beforeEach(() => {
  mockPush.mockClear();
  useWindowDimensionsSpy.mockReturnValue(defaultDimensions);
});

afterAll(() => useWindowDimensionsSpy.mockRestore());

// ---------------------------------------------------------------------------
// RecentGamesScroll
// ---------------------------------------------------------------------------
describe('RecentGamesScroll', () => {
  it('renders the empty-state card when there are no matches', () => {
    const { getByText } = render(<RecentGamesScroll matches={[]} />);
    expect(getByText('No games yet')).toBeTruthy();
  });

  it('renders a win card for result "W"', () => {
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
    expect(getByText('Win')).toBeTruthy();
    expect(getByText('21-18')).toBeTruthy();
    expect(getByText('Apr 1 · South Bay')).toBeTruthy();
  });

  it('renders a loss card when result is not a win', () => {
    const match = { id: 2, result: 'L', score: '15-21' };
    const { getByText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    expect(getByText('Loss')).toBeTruthy();
  });

  it('renders an unknown result as pending instead of a loss', () => {
    const match = { id: 2, result: null, score: null };
    const { getByText, queryByText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    expect(getByText('Pending')).toBeTruthy();
    expect(queryByText('Loss')).toBeNull();
  });

  it('shows an open session as understated text alongside a known result', () => {
    const match = { id: 3, result: 'W', session_status: 'pending' };
    const { getByText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    expect(getByText('Win')).toBeTruthy();
    expect(getByText('Session open')).toBeTruthy();
  });

  it('uses the open session status in place of a generic pending result', () => {
    const match = { id: 3, session_status: 'active' };
    const { getByText, queryByText } = render(<RecentGamesScroll matches={[match]} />);
    expect(getByText('Session open')).toBeTruthy();
    expect(queryByText('Pending')).toBeNull();
  });

  it('keeps play type and rating status in the card’s accessible name without visual badges', () => {
    const match = {
      id: 4,
      session_id: 44,
      result: 'W',
      partner: 'Guest Player',
      partner_is_placeholder: true,
    };
    const { queryByText, getByLabelText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    expect(queryByText(/Rating pending|Pickup game|League game/i)).toBeNull();
    expect(
      getByLabelText(/Pickup game.*Rating pending until every player has an account/),
    ).toBeTruthy();
  });

  it('caps the number of visible cards at maxItems', () => {
    const matches = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      session_id: i + 1,
      result: 'W',
      score: `21-${i}`,
    }));
    const { getAllByLabelText, getByTestId } = render(
      <RecentGamesScroll matches={matches as any} maxItems={3} />,
    );
    expect(getAllByLabelText(/^Win/)).toHaveLength(3);
    expect(getByTestId('recent-games-row').props).toMatchObject({
      horizontal: true,
      snapToInterval: 184.5,
    });
  });

  it('displays two recent games side by side without scrolling by default', () => {
    const matches = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      session_id: i + 1,
      result: 'W',
      score: `21-${i}`,
    }));
    const { getAllByRole, getByTestId } = render(<RecentGamesScroll matches={matches} />);
    expect(getByTestId('recent-games-row').props.horizontal).toBeUndefined();
    expect(getAllByRole('link').map((card) => card.props.accessibilityLabel)).toEqual([
      'Win, 21-0, Pickup game',
      'Win, 21-1, Pickup game',
    ]);
  });

  it('navigates to session when a game card with a session_id is pressed', () => {
    const match = { id: 1, result: 'W', score: '21-18', session_id: 42 };
    const { getByLabelText } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    fireEvent.press(getByLabelText('Win, 21-18, Pickup game'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/session/42');
  });

  it('does not navigate when a game card has no session_id', () => {
    const match = { id: 1, result: 'W', score: '21-18' };
    const { queryByRole } = render(
      <RecentGamesScroll matches={[match] as any} />,
    );
    expect(queryByRole('link')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LeaguesScroll
// ---------------------------------------------------------------------------
describe('LeaguesScroll', () => {
  it('renders "+ Join a League" when there are no leagues', () => {
    const { getByText } = render(<LeaguesScroll leagues={[]} />);
    expect(getByText('+ Join a League')).toBeTruthy();
  });

  it('does not render Join a League when memberships exist', () => {
    const { queryByText } = render(
      <LeaguesScroll leagues={[{ id: 1, name: 'Open' }] as any} />,
    );
    expect(queryByText('+ Join a League')).toBeNull();
  });

  it('displays two league cards side by side without scrolling by default', () => {
    const leagues = Array.from({ length: 3 }, (_, index) => ({
      id: index + 1,
      name: `League ${index + 1}`,
    }));
    const { getAllByRole, getByTestId } = render(<LeaguesScroll leagues={leagues as any} />);
    expect(getByTestId('my-leagues-row').props.horizontal).toBeUndefined();
    expect(getAllByRole('link')).toHaveLength(2);
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

  it('shows the date of the latest league game', () => {
    const leagues = [{ id: 1, name: 'Pro', last_game_date: '2026-04-01' }];
    const { getByText, getByLabelText } = render(<LeaguesScroll leagues={leagues} />);
    expect(getByText('Last game Apr 1, 2026')).toBeTruthy();
    expect(getByLabelText('Pro, 0 players, Last game Apr 1, 2026')).toBeTruthy();
  });

  it('shows when an archived league has no games', () => {
    const leagues = [{ id: 1, name: 'Pro', is_archived: true }];
    const { getByText } = render(<LeaguesScroll leagues={leagues} />);
    expect(getByText('Archived')).toBeTruthy();
    expect(getByText('No games yet')).toBeTruthy();
  });

  it('navigates to the league route when a card is pressed', () => {
    const leagues = [{ id: 9, name: 'Coastal', member_count: 4 }];
    const { getByLabelText } = render(
      <LeaguesScroll leagues={leagues as any} />,
    );
    fireEvent.press(getByLabelText('Coastal, 4 players, No games yet'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/league/9');
  });

  it('navigates to find-leagues when the Join card is pressed', () => {
    const { getByLabelText } = render(<LeaguesScroll leagues={[]} />);
    fireEvent.press(getByLabelText('Join a league'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/find-leagues');
  });
});

it.each([{ fontScale: 2 }, { width: 320 }])(
  'stacks both previews when the content needs more room (%j)',
  (dimensions) => {
    useWindowDimensionsSpy.mockReturnValue({ ...defaultDimensions, ...dimensions });
    const { queryByTestId, getAllByRole } = render(
      <>
        <RecentGamesScroll matches={[{ id: 1, session_id: 11 }, { id: 2, session_id: 12 }]} />
        <LeaguesScroll leagues={[{ id: 1, name: 'Indoor' }, { id: 2, name: 'Beach' }] as any} />
      </>,
    );
    expect(queryByTestId('recent-games-row')).toBeNull();
    expect(queryByTestId('my-leagues-row')).toBeNull();
    expect(getAllByRole('link')).toHaveLength(4);
  },
);

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

  it('limits the discovery sample to three courts by default', () => {
    const courts = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      name: `Court ${index + 1}`,
    }));
    const { getAllByRole } = render(<CourtsScroll courts={courts as any} />);
    expect(getAllByRole('link')).toHaveLength(3);
  });
});
