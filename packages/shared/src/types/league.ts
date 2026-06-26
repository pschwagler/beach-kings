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

/**
 * Legacy standings row embedded in the old GET /api/leagues/:id response
 * (consumed by the `League.standings` field below). New code should use
 * `LeagueStanding` from `LeagueStandingsResponse` instead — this type only
 * exists to keep the legacy `League` shape compilable.
 *
 * @deprecated Use `LeagueStanding` for any new consumer.
 */
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

/**
 * Compact season descriptor returned alongside `LeagueStandingsResponse`.
 *
 * Overlaps with `LeagueSeason` but with both timestamps nullable. New code
 * should prefer `LeagueSeason` and treat `is_active` as optional; this type
 * is retained for the standings endpoint until that response is widened.
 */
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

/**
 * Raw API row from `GET /api/leagues/:id/members`. The backend's
 * `LeagueMemberDetailResponse` shape — used as the input that `LeagueMemberRow`
 * is derived from in the mobile hook.
 */
export interface LeagueMemberApiRow {
  id: number;
  league_id?: number | null;
  player_id: number;
  role: string;
  player_name?: string | null;
  player_nickname?: string | null;
  player_level?: string | null;
  player_avatar?: string | null;
  joined_at?: string | null;
  /** Convenience alias used by some adapters; backend may emit either field. */
  created_at?: string | null;
  is_placeholder?: boolean;
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
  /** Surfaced by GET /api/users/me/leagues so the Add Games flow can scope a session to the right season. */
  current_season_id?: number | null;
  current_season_name?: string | null;
}

// ---------------------------------------------------------------------------
// League invites
// ---------------------------------------------------------------------------

/** Status of a pending invite. */
export type LeagueInviteStatus = 'pending' | 'accepted' | 'declined';

/** Response from POST /api/leagues/{leagueId}/invites/respond. */
export interface InviteActionResponse {
  status: string;
}

/** A player that can be invited to a league (GET /api/leagues/:id/invitable-players). */
export interface InvitablePlayer {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly location_name: string | null;
  readonly level: string | null;
  readonly invite_status: 'none' | 'member' | 'invited' | 'requested';
  readonly section: 'friends' | 'recent_opponents' | 'suggested';
}

/** A sent invite row (GET /api/leagues/:id/invites or GET /api/users/me/league-invites/sent). */
export interface LeagueInviteItem {
  readonly id: number;
  readonly league_id: number;
  readonly league_name: string;
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly invited_at: string;
  readonly status: LeagueInviteStatus;
  readonly is_placeholder?: boolean;
  readonly game_count?: number;
}

// ---------------------------------------------------------------------------
// Player profile leagues (GET /api/players/:id/leagues)
// ---------------------------------------------------------------------------

/**
 * Slim league row returned by GET /api/players/:id/leagues.
 * Public leagues only; rank and games_played reflect the current season.
 */
export interface PlayerLeague {
  readonly id: number;
  readonly name: string;
  readonly rank: number | null;
  readonly games_played: number;
}

// ---------------------------------------------------------------------------
// League player stats
// ---------------------------------------------------------------------------

/**
 * A single partner or opponent row inside ``LeaguePlayerStats``.
 * Matches the shape returned by GET /api/leagues/:leagueId/players/:playerId/stats.
 */
export interface LeaguePlayerRelationStat {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly games_played: number;
  readonly wins: number;
  readonly losses: number;
  readonly win_rate: number;
}

/** Overall record block in ``LeaguePlayerStats``. */
export interface LeaguePlayerOverallStats {
  readonly wins: number;
  readonly losses: number;
  readonly win_rate: number;
  readonly games_played: number;
  readonly point_diff: number;
}

/**
 * Aggregated stats for a single player in the context of a league
 * (and optionally a specific season). Backed by
 * GET /api/leagues/:leagueId/players/:playerId/stats[?season_id=].
 *
 * ``rank``, ``rating_delta``, and ``game_history`` are placeholders for now
 * and may be ``null`` / empty until the backend computes them.
 */
export interface LeaguePlayerStats {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly level: string | null;
  readonly location_name: string | null;
  readonly league_id: number;
  readonly league_name: string;
  readonly season_id: number | null;
  readonly season_name: string | null;
  readonly rank: number | null;
  readonly rating: number;
  readonly rating_delta: number | null;
  readonly points: number | null;
  readonly overall: LeaguePlayerOverallStats;
  readonly partners: readonly LeaguePlayerRelationStat[];
  readonly opponents: readonly LeaguePlayerRelationStat[];
  readonly game_history: readonly import('./game').GameHistoryEntry[];
  readonly is_self: boolean;
}
