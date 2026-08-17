import type { SessionGame } from '@beach-kings/shared';
import {
  getViewerSlotForGame,
  getViewerTeamForGame,
} from '@/components/screens/Sessions/sessionGameIdentity';

const baseGame: SessionGame = {
  id: 1,
  game_number: 1,
  team1_player1_id: 10,
  team1_player2_id: 20,
  team2_player1_id: 30,
  team2_player2_id: 40,
  team1_player1_name: 'Same Name',
  team1_player2_name: 'same name',
  team2_player1_name: 'SAME NAME',
  team2_player2_name: 'Same Name',
  team1_score: 15,
  team2_score: 12,
  winner: 1,
  rating_change: null,
  is_ranked: true,
};

describe('session game viewer identity', () => {
  it.each([
    [10, 'team1_player1', 1],
    [20, 'team1_player2', 1],
    [30, 'team2_player1', 2],
    [40, 'team2_player2', 2],
  ] as const)(
    'resolves player %i in %s to team %i regardless of duplicate names',
    (currentPlayerId, expectedSlot, expectedTeam) => {
      expect(getViewerSlotForGame(baseGame, currentPlayerId)).toBe(
        expectedSlot,
      );
      expect(getViewerTeamForGame(baseGame, currentPlayerId)).toBe(
        expectedTeam,
      );
    },
  );

  it.each([
    ['viewer absent', baseGame, 999],
    ['viewer ID unavailable', baseGame, null],
    [
      'all player IDs unavailable',
      {
        ...baseGame,
        team1_player1_id: null,
        team1_player2_id: null,
        team2_player1_id: null,
        team2_player2_id: null,
      },
      10,
    ],
    ['viewer ID duplicated', { ...baseGame, team1_player2_id: 10 }, 10],
  ] as const)('stays neutral when %s', (_label, game, currentPlayerId) => {
    expect(getViewerSlotForGame(game, currentPlayerId)).toBeNull();
    expect(getViewerTeamForGame(game, currentPlayerId)).toBeNull();
  });
});
