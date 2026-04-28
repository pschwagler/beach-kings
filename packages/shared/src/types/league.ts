/**
 * League-related types.
 */

import type { LeagueGender, LeagueMemberRole, SkillLevel } from './enums';

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

/**
 * A single join request row returned from GET /api/leagues/:id/join-requests.
 */
export interface JoinRequest {
  id: number;
  player_id: number;
  /** First + last name concatenated by the backend. */
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
  /** ISO date string. */
  requested_at: string;
  /** Two-letter initials derived from display_name (presentation field, optional on backend). */
  initials?: string | null;
  /** Optional free-text note attached when the player requested to join. */
  message?: string | null;
}

/**
 * Response shape from GET /api/leagues/:id/join-requests.
 */
export interface JoinRequestsResponse {
  pending: JoinRequest[];
  rejected: JoinRequest[];
}

// ---------------------------------------------------------------------------
// Find leagues (POST /api/leagues/query)
// ---------------------------------------------------------------------------

/** A single league card returned by the find-leagues search, adapted from the raw query response. */
export interface FindLeagueResult {
  readonly id: number;
  readonly name: string;
  readonly gender: 'mens' | 'womens' | 'coed';
  readonly level: string | null;
  /** Derived from backend `is_open`: true → 'open', false → 'invite_only'. */
  readonly access_type: 'open' | 'invite_only';
  readonly location_name: string | null;
  readonly member_count: number;
  /** Friends currently in this league (derived from backend `friends_preview`). */
  readonly friends_in_league: ReadonlyArray<{ readonly player_id: number; readonly initials: string }>;
  /** Derived from backend `has_pending_request`. 'member' is not returned by this endpoint. */
  readonly user_status: 'none' | 'member' | 'requested';
}

/** Paginated response from POST /api/leagues/query (with items adapted to FindLeagueResult). */
export interface LeagueQueryResponse {
  readonly items: readonly FindLeagueResult[];
  readonly page: number;
  readonly page_size: number;
  readonly total_count: number;
}

export interface LeagueMember {
  id: number;
  league_id: number;
  player_id: number;
  /** Role within the league. Comes from joined queries, not the Player object. */
  role: LeagueMemberRole;
  created_at: string;
  /** player_name comes from joined queries (not on the base Player object). */
  player_name?: string | null;
  is_placeholder?: boolean | null;
}

export interface HomeCourtResponse {
  id: number;
  name: string;
  address: string | null;
  position: number;
}

export interface LeagueStandingRow {
  player_id: number;
  name: string;
  elo: number;
  points: number;
  games: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pt_diff: number;
  season_rank?: number;
  initials?: string;
  is_placeholder?: boolean;
}

export interface LeagueMatchRow {
  id: number;
  date: string | null;
  session_id: number | null;
  session_name: string | null;
  session_status: string | null;
  session_season_id: number | null;
  team1_player1_id: number | null;
  team1_player1_name: string | null;
  team1_player2_id: number | null;
  team1_player2_name: string | null;
  team2_player1_id: number | null;
  team2_player1_name: string | null;
  team2_player2_id: number | null;
  team2_player2_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner: number | null;
  is_ranked: boolean | null;
  ranked_intent: boolean | null;
  elo_changes: Record<string, { elo_before?: number; elo_after: number; elo_change: number }>;
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

/**
 * A single chat message returned from `GET /api/leagues/:id/messages`.
 *
 * Backend (apps/backend/services/message_data.py) populates everything except
 * `initials`, which is derived client-side from `player_name` for presentation.
 */
export interface LeagueChatMessage {
  readonly id: number;
  readonly league_id: number;
  readonly user_id: number;
  readonly player_id: number | null;
  readonly player_name: string | null;
  readonly message: string;
  readonly created_at: string | null;
  /** Server-computed: true when row.user_id == authenticated caller. */
  readonly is_mine: boolean;
  /** Client-derived from player_name (e.g. "Patrick Schwagler" -> "PS"). */
  readonly initials: string;
}

// ---------------------------------------------------------------------------
// Standings (GET /api/leagues/:id/standings)
// ---------------------------------------------------------------------------

export interface LeagueStanding {
  readonly rank: number;
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly avatar_url: string | null;
  readonly wins: number;
  readonly losses: number;
  readonly win_rate: number;
  readonly rating: number | null;
  readonly rating_delta: number | null;
  readonly games_played: number;
}

export interface LeagueSeasonInfo {
  readonly id: number;
  readonly name: string;
  readonly started_at: string | null;
  readonly ended_at: string | null;
  readonly session_count: number;
  readonly game_count: number;
}

/** A season entry as rendered in the League Info tab seasons list. */
export interface LeagueSeason {
  readonly id: number;
  readonly name: string;
  readonly is_active: boolean;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly session_count: number;
  readonly game_count: number;
}

export interface LeagueStandingsResponse {
  readonly standings: readonly LeagueStanding[];
  readonly season_info: LeagueSeasonInfo | null;
}

// ---------------------------------------------------------------------------
// League Detail (GET /api/leagues/:id)
// ---------------------------------------------------------------------------

/**
 * Enriched league detail returned by GET /api/leagues/:id.
 * Includes membership context and current-season stats for the authenticated caller.
 * All user_* fields are null for non-members.
 */
export interface LeagueDetail {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  /** Derived from backend `is_open`: true → 'open', false → 'invite_only'. */
  readonly access_type: 'open' | 'invite_only';
  readonly gender: 'mens' | 'womens' | 'coed' | null;
  readonly level: string | null;
  readonly location_id: string | null;
  readonly location_name: string | null;
  readonly home_courts: readonly HomeCourtResponse[];
  readonly member_count: number;
  readonly season_count: number;
  readonly current_season_id: number | null;
  readonly current_season_name: string | null;
  readonly is_active: boolean;
  /** 'admin' | 'member' | null (null = non-member / visitor). */
  readonly user_role: 'admin' | 'member' | null;
  readonly user_rank: number | null;
  readonly user_wins: number | null;
  readonly user_losses: number | null;
  readonly user_rating: number | null;
}

// ---------------------------------------------------------------------------
// League Info tab types (promoted from mobile mockApi)
// ---------------------------------------------------------------------------

/**
 * A player row in the League Info tab.
 * `id` is the league_member PK — required for updateLeagueMember / removeLeagueMember.
 */
export interface LeagueMemberRow {
  readonly id: number;
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly role: LeagueMemberRole;
  readonly joined_at: string;
}

/** Full info tab payload composed from multiple parallel API calls. */
export interface LeagueInfoDetail {
  readonly id: number;
  readonly description: string | null;
  readonly access_type: 'open' | 'invite_only';
  readonly level: string | null;
  readonly location_id: string | null;
  readonly location_name: string | null;
  readonly home_courts: readonly HomeCourtResponse[];
  readonly members: readonly LeagueMemberRow[];
  readonly seasons: readonly LeagueSeason[];
  readonly join_requests: readonly JoinRequest[];
}

export interface League {
  id: number;
  name: string;
  gender?: LeagueGender | null;
  level?: SkillLevel | null;
  location_id?: string | null;
  location_name?: string | null;
  region_name?: string | null;
  description?: string | null;
  is_open?: boolean | null;
  is_public?: boolean | null;
  member_count?: number | null;
  games_played?: number | null;
  created_at?: string;
  standings?: LeagueStandingRow[] | null;
  recent_matches?: LeagueMatchRow[] | null;
  members?: LeagueMember[] | null;
  home_courts?: HomeCourtResponse[] | null;
  current_season?: { name?: string | null } | null;
}
