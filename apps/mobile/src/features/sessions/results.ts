import type { SessionGame } from '@beach-kings/shared';

export interface SessionPlayerResult {
  readonly key: string;
  readonly name: string;
  readonly wins: number;
  readonly losses: number;
  readonly pointDifferential: number;
}

const SLOTS = [
  { id: 'team1_player1_id', name: 'team1_player1_name', team: 1 },
  { id: 'team1_player2_id', name: 'team1_player2_name', team: 1 },
  { id: 'team2_player1_id', name: 'team2_player1_name', team: 2 },
  { id: 'team2_player2_id', name: 'team2_player2_name', team: 2 },
] as const;

/** Session-local results, using scored games only, like the web summary. */
export function buildSessionResults(games: readonly SessionGame[]): readonly SessionPlayerResult[] {
  const results = new Map<string, SessionPlayerResult>();
  for (const game of games) {
    const a = game.team1_score;
    const b = game.team2_score;
    // Neither missing scores nor ties represent a win or a loss. Zero is a score.
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
    const winner = game.winner ?? (a > b ? 1 : 2);
    const seen = new Set<string>();
    for (const slot of SLOTS) {
      const name = game[slot.name].trim();
      if (name === '') continue;
      const id = game[slot.id];
      // IDs distinguish players with the same display name. Older name-only
      // placeholders retain web parity without guessing a registered identity.
      const key = id != null ? `player:${id}` : `name:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const previous = results.get(key) ?? { key, name, wins: 0, losses: 0, pointDifferential: 0 };
      const won = slot.team === winner;
      results.set(key, {
        ...previous,
        wins: previous.wins + (won ? 1 : 0),
        losses: previous.losses + (won ? 0 : 1),
        pointDifferential: previous.pointDifferential + (slot.team === 1 ? a - b : b - a),
      });
    }
  }
  return [...results.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}
