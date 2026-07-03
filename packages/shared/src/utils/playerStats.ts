/**
 * Player stats normalization.
 *
 * The `Player` type models two different aggregate-stats shapes returned by
 * different backend endpoints:
 *   - A flat shape (`current_rating`, `total_games`, `wins`, `total_wins`,
 *     `losses` directly on the player object) — e.g. player search results.
 *   - A nested shape (`stats.current_rating`, `stats.total_games`,
 *     `stats.total_wins`) with no top-level aggregates and no `losses`
 *     field at all — e.g. `/api/users/me/player`.
 *
 * `normalizePlayerStats` is the single source of truth for reconciling both
 * shapes: it prefers the nested `stats` bag when present and falls back to
 * the flat fields otherwise, deriving `losses` when the backend does not
 * return one directly.
 */

/**
 * Minimal structural shape `normalizePlayerStats` needs. Deliberately looser
 * than the full `Player` type so callers can pass any object exposing these
 * fields (e.g. a subset used in a test fixture) without a cast.
 */
export interface PlayerStatsSource {
  readonly current_rating?: number | null;
  readonly total_games?: number | null;
  readonly wins?: number | null;
  readonly total_wins?: number | null;
  readonly losses?: number | null;
  readonly stats?: Record<string, number | null | undefined> | null;
}

/** Normalized aggregate stats for a player. */
export interface NormalizedPlayerStats {
  /** ELO rating. Null when unavailable from either shape. */
  readonly rating: number | null;
  /** Total games played. Defaults to 0 when unavailable (always backend-visible). */
  readonly games: number;
  /**
   * Total wins, or `null` when the win/loss record is unknown — e.g. a
   * privacy-gated public profile (`game_history_visible === false`) returns
   * `total_wins: null` while `total_games` stays positive. Never coerced to 0,
   * so callers can distinguish "hidden" from a real "0 wins".
   */
  readonly wins: number | null;
  /**
   * Total losses, or `null` when unknown. Uses the backend-provided value
   * when present; otherwise derives `max(0, games - wins)` ONLY when `wins`
   * is a real number. When `wins` is unknown it stays `null` rather than
   * fabricating an all-losses record from `games`.
   */
  readonly losses: number | null;
}

const UNKNOWN_STATS: NormalizedPlayerStats = {
  rating: null,
  games: 0,
  wins: null,
  losses: null,
};

/**
 * Reconcile a player's nested (`stats.*`) and flat aggregate-stats fields
 * into a single normalized shape.
 *
 * Precedence is nested-first, flat-fallback: `stats.current_rating` wins
 * over `current_rating`, `stats.total_games` wins over `total_games`, and
 * `stats.total_wins` wins over `total_wins`/`wins`. Uses `??` throughout
 * (never `||`) so a real `0` value is preserved rather than treated as missing.
 *
 * `wins` stays `null` when absent from both shapes rather than collapsing to
 * 0 — a privacy-gated public profile reports `total_wins: null` with positive
 * `total_games`, and coercing that to 0 would then derive a fabricated
 * all-losses record. `losses` is read directly off the player when present;
 * otherwise it is derived as `max(0, games - wins)` ONLY when `wins` is a real
 * number, and stays `null` when `wins` is unknown.
 *
 * @param player - The player to read stats from, or null/undefined.
 * @returns Normalized stats. `wins`/`losses` are `null` when unknown.
 */
export function normalizePlayerStats(
  player: PlayerStatsSource | null | undefined,
): NormalizedPlayerStats {
  if (!player) return UNKNOWN_STATS;

  const rating = player.stats?.current_rating ?? player.current_rating ?? null;
  const games = player.stats?.total_games ?? player.total_games ?? 0;
  const wins =
    player.stats?.total_wins ?? player.total_wins ?? player.wins ?? null;
  const losses =
    player.losses ?? (wins != null ? Math.max(0, games - wins) : null);

  return { rating, games, wins, losses };
}
