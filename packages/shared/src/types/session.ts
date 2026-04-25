/**
 * Session, match, and ELO types.
 */

import type { SessionStatus, SessionType } from './enums';

// ---------------------------------------------------------------------------
// Game (match) creation — POST /api/matches
// ---------------------------------------------------------------------------

/**
 * Payload sent when submitting a scored game.
 *
 * - `session_id: null` signals a brand-new pickup session; the backend creates
 *   one and returns it in GameCreateResponse.session_id.
 * - `league_id` threads the game into a league/season context when provided.
 * - `is_ranked` defaults to true for league games, false for pickup games.
 */
export interface GameCreatePayload {
  readonly session_id: number | null;
  readonly league_id?: number | null;
  readonly season_id?: number | null;
  readonly date?: string | null;
  readonly team1_player1_id: number;
  readonly team1_player2_id: number;
  readonly team2_player1_id: number;
  readonly team2_player2_id: number;
  readonly team1_score: number;
  readonly team2_score: number;
  readonly is_ranked: boolean;
  readonly is_public?: boolean;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

/**
 * Response from POST /api/matches.
 * The `session_id` is always present — when a new session was created it
 * reflects the newly created session's id.
 */
export interface GameCreateResponse {
  readonly status: string;
  readonly message: string;
  readonly match_id: number;
  readonly session_id: number;
}

/**
 * A single session participant returned by GET /api/sessions/:id/participants.
 */
export interface SessionParticipant {
  readonly player_id: number;
  readonly full_name: string;
  readonly level: string | null;
  readonly gender: string | null;
  readonly location_name: string | null;
  readonly is_placeholder: boolean;
}

export interface Session {
  id: number;
  season_id: number;
  date?: string | null;
  status?: SessionStatus | null;
  code?: string | null;
  league_id?: number | null;
  league_name?: string | null;
  court_id?: number | null;
  court_name?: string | null;
  court_slug?: string | null;
  match_count?: number | null;
  created_by?: number | null;
  created_by_name?: string | null;
  updated_by?: number | null;
  updated_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  participation?: string | null;
  name?: string | null;
  user_match_count?: number | null;
  /** Time of day when the session starts, e.g. "3:00 PM". */
  start_time?: string | null;
  /**
   * Session access type — 'pickup' (open) or 'league' (members only).
   * Stored as a VARCHAR column added in migration 046.
   */
  session_type?: SessionType | null;
  /** Maximum number of players allowed in the session. */
  max_players?: number | null;
  /** Free-text notes visible to all participants. */
  notes?: string | null;
}

/** Payload accepted by POST /api/sessions (create non-league session). */
export interface SessionCreatePayload {
  date?: string | null;
  name?: string | null;
  court_id?: number | null;
  start_time?: string | null;
  session_type?: SessionType | null;
  max_players?: number | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface EloChange {
  elo_before: number;
  elo_after: number;
  elo_change: number;
}

/**
 * One row of a player's match history as returned by the match history API.
 * This is a superset of all fields consumed by widgets and stats components.
 * Index signature allows extra dynamic keys (e.g. from league-level formatters).
 */
export interface MatchRecord {
  [key: string]: string | number | boolean | null | undefined;
  result?: string | null;
  score?: string | null;
  date?: string | null;
  partner?: string | null;
  partner_id?: number | null;
  partner_is_placeholder?: boolean;
  opponent_1?: string | null;
  opponent_1_id?: number | null;
  opponent_1_is_placeholder?: boolean;
  opponent_2?: string | null;
  opponent_2_id?: number | null;
  opponent_2_is_placeholder?: boolean;
  session_status?: string | null;
  session_code?: string | null;
  elo_after?: number | null;
  elo_before?: number | null;
  elo_change?: number | null;
  is_ranked?: boolean | null;
  league_id?: number | string | null;
  league_name?: string | null;
  court_name?: string | null;
  season_id?: number | string | null;
  season_name?: string | null;
}

export interface Match {
  id: number;
  session_id?: number | null;
  team1_score?: number | null;
  team2_score?: number | null;
  winner?: number | null;
  team1_player1_id?: number | null;
  team1_player2_id?: number | null;
  team2_player1_id?: number | null;
  team2_player2_id?: number | null;
  team1_player1_name?: string | null;
  team1_player2_name?: string | null;
  team2_player1_name?: string | null;
  team2_player2_name?: string | null;
  team1_player1?: string | null;
  team1_player2?: string | null;
  team2_player1?: string | null;
  team2_player2?: string | null;
  date?: string | null;
  elo_changes?: Record<string, EloChange> | null;
  matchup_id?: number | null;
  court_num?: number | null;
  round_num?: number | null;
  /** DB column is BOOLEAN NOT NULL DEFAULT TRUE. True = player requested ranked; false = explicitly unranked. */
  ranked_intent?: boolean | null;
  phase?: string | null;
  is_ranked?: boolean | null;
  is_bye?: boolean | null;
  bracket_position?: number | null;
  game_scores?: unknown | null;
  session_name?: string | null;
  session_status?: string | null;
  session_season_id?: number | null;
}
