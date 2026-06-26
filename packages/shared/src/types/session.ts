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
  season_id?: number | null;
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

/**
 * Payload accepted by POST /api/sessions.
 *
 * Historically non-league only; ``league_id`` + ``season_id`` were added so
 * the mobile score-screen "Manage Session" flow can lazily create a league
 * session before any matches exist (see
 * apps/mobile/MOBILE_ADD_GAMES_VALIDATION.md Flow 2.3 / 4.3). When
 * ``league_id`` is set the backend routes through a get-or-create path, so
 * the call is idempotent.
 */
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
  league_id?: number | null;
  season_id?: number | null;
  /** Session-level ranked intent. Defaults to true on the backend when omitted. */
  is_ranked?: boolean | null;
}

// ---------------------------------------------------------------------------
// Session roster types (used by the Manage Players screen)
// ---------------------------------------------------------------------------

/**
 * A single player entry returned by GET /api/sessions/:id (roster view).
 *
 * `entry_id` is the SessionParticipant.player_id — this is what the
 * DELETE /api/sessions/:id/participants/:player_id endpoint expects.
 */
export interface SessionPlayerEntry {
  /** The player_id (also used as the remove-endpoint path param). */
  readonly entry_id: number;
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  /** Number of games this player has in the session. */
  readonly game_count: number;
  /** True when the player is an unregistered placeholder. */
  readonly is_placeholder: boolean;
}

// ---------------------------------------------------------------------------
// Session detail types (used by the Session Detail / overview screen)
// ---------------------------------------------------------------------------

/**
 * A player entry in a session's roster, as returned by the full session
 * detail endpoint (GET /api/sessions/:id).
 */
export interface SessionPlayer {
  readonly entry_id: number;
  readonly player_id: number | null;
  readonly display_name: string;
  readonly initials: string;
  readonly is_placeholder: boolean;
  /** Number of games played by this player in this session. */
  readonly game_count: number;
  /**
   * Invite URL for placeholder players whose owner created a `PlayerInvite`
   * row. Null/undefined for real players or placeholders with no invite token.
   */
  readonly invite_url?: string | null;
}

/**
 * A single game (match) within a session, as returned by the full session
 * detail endpoint (GET /api/sessions/:id).
 */
export interface SessionGame {
  readonly id: number;
  /** 1-based sequential number within the session. */
  readonly game_number: number;
  readonly team1_player1_id: number | null;
  readonly team1_player2_id: number | null;
  readonly team2_player1_id: number | null;
  readonly team2_player2_id: number | null;
  readonly team1_player1_name: string;
  readonly team1_player2_name: string;
  readonly team2_player1_name: string;
  readonly team2_player2_name: string;
  readonly team1_score: number | null;
  readonly team2_score: number | null;
  /** 1 = team1 won, 2 = team2 won, null = pending/unscored. */
  readonly winner: 1 | 2 | null;
  /** Net ELO change for the calling user in this game; null until submitted. */
  readonly rating_change: number | null;
  /** Whether the game was ranked (ELO-affecting). Null when unknown. */
  readonly is_ranked: boolean | null;
}

/**
 * Full session detail (active or submitted) returned by GET /api/sessions/:id.
 *
 * Used by the Session Detail overview screen. Includes roster, games, and
 * aggregate stats for the calling user.
 *
 * Status values are normalised to lowercase on the client:
 *   'active'    — session is still in progress
 *   'submitted' — session is locked/closed
 */
export interface SessionDetail {
  readonly id: number;
  /** Shareable join code, e.g. "BK4XJ9P2". Null when the session does not have one. */
  readonly code: string | null;
  readonly league_id: number | null;
  readonly league_name: string | null;
  readonly court_name: string | null;
  readonly date: string;
  readonly start_time: string | null;
  /** 1-based sequential session number within the day. */
  readonly session_number: number;
  readonly status: 'active' | 'submitted';
  readonly session_type: SessionType;
  readonly max_players: number | null;
  readonly notes: string | null;
  /** Whether this session counts toward rankings. Defaults to true (server default). */
  readonly is_ranked: boolean;
  readonly players: readonly SessionPlayer[];
  readonly games: readonly SessionGame[];
  /** Total wins for the calling user in this session. */
  readonly user_wins: number;
  /** Total losses for the calling user in this session. */
  readonly user_losses: number;
  /** Net ELO change for the calling user across the session; null until submitted. */
  readonly user_rating_change: number | null;
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
