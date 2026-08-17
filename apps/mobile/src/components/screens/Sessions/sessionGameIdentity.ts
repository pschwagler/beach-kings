import type { SessionGame } from '@beach-kings/shared';

export type SessionGamePlayerSlot =
  | 'team1_player1'
  | 'team1_player2'
  | 'team2_player1'
  | 'team2_player2';

const PLAYER_SLOTS = [
  { slot: 'team1_player1', team: 1, idKey: 'team1_player1_id' },
  { slot: 'team1_player2', team: 1, idKey: 'team1_player2_id' },
  { slot: 'team2_player1', team: 2, idKey: 'team2_player1_id' },
  { slot: 'team2_player2', team: 2, idKey: 'team2_player2_id' },
] as const satisfies readonly {
  slot: SessionGamePlayerSlot;
  team: 1 | 2;
  idKey: keyof SessionGame;
}[];

/**
 * Resolves the viewer to one canonical game slot by player ID. Malformed games
 * with no match or duplicate matches stay neutral instead of guessing.
 */
export function getViewerSlotForGame(
  game: SessionGame,
  currentPlayerId: number | null,
): SessionGamePlayerSlot | null {
  if (
    currentPlayerId == null ||
    !Number.isInteger(currentPlayerId) ||
    currentPlayerId <= 0
  ) {
    return null;
  }

  const matches = PLAYER_SLOTS.filter(
    ({ idKey }) => game[idKey] === currentPlayerId,
  );
  return matches.length === 1 ? matches[0].slot : null;
}

export function getViewerTeamForGame(
  game: SessionGame,
  currentPlayerId: number | null,
): 1 | 2 | null {
  const viewerSlot = getViewerSlotForGame(game, currentPlayerId);
  if (viewerSlot == null) return null;
  return PLAYER_SLOTS.find(({ slot }) => slot === viewerSlot)?.team ?? null;
}
