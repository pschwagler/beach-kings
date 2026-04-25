/**
 * Shared types for the My Games history endpoint.
 *
 * These types are shared between the API client and the mobile app.
 * The backend endpoint is GET /api/users/me/games.
 */

/** A single game entry in the current user's match history. */
export interface GameHistoryEntry {
  /** Match id. */
  readonly id: number;
  readonly session_id: number;
  readonly court_label: string | null;
  readonly league_name: string | null;
  readonly league_id: number | null;
  /** "W" = win, "L" = loss, "D" = draw. */
  readonly result: 'W' | 'L' | 'D';
  /** Score for the current user's team. */
  readonly my_score: number;
  readonly opponent_score: number;
  /** Display names of the current user's partner(s). */
  readonly partner_names: string[];
  /** Display names of the opponent players. */
  readonly opponent_names: string[];
  /**
   * ELO rating change for this game.
   * Null when the session has not yet been submitted (no EloHistory row).
   */
  readonly rating_change: number | null;
  /** True when the session has been submitted and ELO has been computed. */
  readonly session_submitted: boolean;
}

/** Query params accepted by GET /api/users/me/games. */
export interface MyGamesQueryParams {
  readonly league_id?: number;
  readonly result?: 'W' | 'L' | 'D';
  readonly limit?: number;
  readonly offset?: number;
}

/** Response envelope for GET /api/users/me/games. */
export interface MyGamesResponse {
  readonly games: GameHistoryEntry[];
  readonly total: number;
}
