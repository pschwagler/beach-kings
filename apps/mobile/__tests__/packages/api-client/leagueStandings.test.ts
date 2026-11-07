import { createLeagueMethods } from '../../../../../packages/api-client/src/leagueMethods';
import type { AxiosInstance } from 'axios';

function clientFor(globalRating: unknown, includeField = true) {
  const data = {
    standings: [{
      rank: 1, player_id: 10, display_name: 'Test Player', initials: 'TP',
      wins: 4, losses: 2, win_rate: 66.7, games_played: 6,
      rating: 24, rating_delta: null,
      ...(includeField ? { global_rating: globalRating } : {}),
    }],
    season_info: null,
  };
  const get = jest.fn().mockResolvedValue({ data });
  return { get, data, methods: createLeagueMethods({ get } as unknown as AxiosInstance) };
}

describe('league standings global rating', () => {
  it('keeps current global rating distinct from season points in one standings request', async () => {
    const { get, data, methods } = clientFor(1642.5);
    const result = await methods.getLeagueStandings(7, 3);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/leagues/7/standings?season_id=3');
    expect(result.standings[0]).toMatchObject({ rating: 24, global_rating: 1642.5 });
    expect(data.standings[0].global_rating).toBe(1642.5);
  });

  it('normalizes an older server response without substituting season points', async () => {
    const { methods } = clientFor(undefined, false);
    expect((await methods.getLeagueStandings(7, 3)).standings[0])
      .toMatchObject({ rating: 24, global_rating: null });
  });

  it.each([null, undefined, NaN, Infinity, '1642'])('renders unavailable global ratings truthfully (%s)', async (value) => {
    const { methods } = clientFor(value);
    expect((await methods.getLeagueStandings(7)).standings[0].global_rating).toBeNull();
  });

  it('preserves a valid zero rather than treating it as missing', async () => {
    const { methods } = clientFor(0);
    expect((await methods.getLeagueStandings(7)).standings[0].global_rating).toBe(0);
  });
});
