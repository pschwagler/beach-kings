import type { SessionGame } from '@beach-kings/shared';
import { buildSessionResults } from '@/features/sessions/results';

const game: SessionGame = {
  id: 1, game_number: 1,
  team1_player1_id: 1, team1_player2_id: 2,
  team2_player1_id: 3, team2_player2_id: 4,
  team1_player1_name: 'Alex', team1_player2_name: 'Blair',
  team2_player1_name: 'Casey', team2_player2_name: 'Devon',
  team1_score: 21, team2_score: 16, winner: 1,
  rating_change: null, is_ranked: true,
};

describe('session player results', () => {
  it('totals each player across changing partnerships and orders by name like web', () => {
    const second: SessionGame = {
      ...game, id: 2,
      team1_player2_id: 3, team1_player2_name: 'Casey',
      team2_player1_id: 2, team2_player1_name: 'Blair',
      team1_score: 15, team2_score: 21, winner: 2,
    };
    expect(buildSessionResults([game, second])).toEqual([
      { key: 'player:1', name: 'Alex', wins: 1, losses: 1, pointDifferential: -1 },
      { key: 'player:2', name: 'Blair', wins: 2, losses: 0, pointDifferential: 11 },
      { key: 'player:3', name: 'Casey', wins: 0, losses: 2, pointDifferential: -11 },
      { key: 'player:4', name: 'Devon', wins: 1, losses: 1, pointDifferential: 1 },
    ]);
  });

  it('keeps players with identical display names separate by canonical ID', () => {
    const rows = buildSessionResults([{ ...game, team2_player1_name: 'Alex' }]);
    expect(rows.filter((row) => row.name === 'Alex')).toHaveLength(2);
    expect(rows.find((row) => row.key === 'player:1')?.wins).toBe(1);
    expect(rows.find((row) => row.key === 'player:3')?.losses).toBe(1);
  });

  it('counts a shutout score of zero without treating it as missing', () => {
    expect(buildSessionResults([{ ...game, team2_score: 0 }])[0]).toMatchObject({ wins: 1, pointDifferential: 21 });
  });

  it('excludes tied, unscored, and invalid-score games rather than inventing wins or losses', () => {
    expect(buildSessionResults([
      { ...game, team1_score: 21, team2_score: 21, winner: null },
      { ...game, team1_score: null, winner: null },
      { ...game, team1_score: Number.NaN },
    ])).toEqual([]);
  });

  it('infers the result of a scored game without winner metadata, matching web', () => {
    expect(buildSessionResults([{ ...game, team1_score: 0, team2_score: 21, winner: null }])[0]).toMatchObject({ losses: 1, pointDifferential: -21 });
  });

  it('supports name-only legacy entries and empty sessions', () => {
    expect(buildSessionResults([{ ...game, team1_player1_id: null }])[0]).toMatchObject({ key: 'name:Alex', wins: 1 });
    expect(buildSessionResults([])).toEqual([]);
  });
});
