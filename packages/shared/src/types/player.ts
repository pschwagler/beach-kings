/**
 * User and Player types.
 */

import type { PlayerGender, SkillLevel } from './enums';

export interface User {
  id: number;
  phone: string;
  email?: string | null;
  phone_number?: string | null;
  is_verified?: boolean;
  auth_provider?: string;
  created_at?: string;
  deletion_scheduled_at?: string | null;
  is_system_admin?: boolean;
  player?: Player;
}

export interface Player {
  id: number;
  /**
   * Computed display name. The backend's list_players_search serializes this
   * as player.full_name (falling back to "Player {id}"). Both `name` and
   * `full_name` are returned by the player search API; `full_name` is the DB
   * column and is canonical.
   */
  name: string;
  /** Canonical DB column. Matches `name` in player search responses. */
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  gender?: PlayerGender | null;
  level?: SkillLevel | null;
  city?: string | null;
  state?: string | null;
  city_latitude?: number | null;
  city_longitude?: number | null;
  /**
   * Initials-based fallback avatar (e.g. "JD"). Present when no profile
   * picture has been uploaded. Check `profile_picture_url` for the real image.
   */
  avatar?: string | null;
  /** Uploaded profile picture URL (S3). Null if the player has not uploaded one. */
  profile_picture_url?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  location_slug?: string | null;
  /**
   * Player's primary key aliased as player_id. Present in joined contexts
   * (e.g. session participant responses) where the row maps Player.id →
   * player_id. Not returned by the base player search endpoint.
   */
  player_id?: number | null;
  is_placeholder?: boolean | null;
  league_memberships?: Array<{ league_id: number; league_name: string }> | null;
  season_rank?: number | null;
  current_rating?: number | null;
  wins?: number | null;
  losses?: number | null;
  total_games?: number | null;
  total_wins?: number | null;
  signed_up_at?: string | null;
  date_of_birth?: string | null;
  height?: string | null;
  preferred_side?: string | null;
  distance_to_location?: number | null;
  stats?: Record<string, number | null | undefined>;
  /**
   * Threaded from PublicPlayerResponse when the Player was fetched via the
   * public profile endpoint. False means the player has hidden their game
   * history — do not render W-L / rating / win% tiles.
   */
  game_history_visible?: boolean;
  /**
   * Threaded from PublicPlayerResponse. True when the player's profile is
   * fully private.
   */
  profile_is_private?: boolean;
}

/**
 * A court a player has designated as a home court, ordered by `position`.
 * Returned by `GET /api/players/{id}/home-courts`. Includes coordinates so
 * clients can use the player's #1 home court as a location-resolution fallback.
 */
export interface PlayerHomeCourt {
  id: number;
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  position: number;
}

/**
 * Pill shown on a relevance-ranked player search row. At most three appear
 * per player; every other relationship signal contributes to the score
 * silently. The league pill is context-exclusive:
 *
 *   in_league      — member of the current league-match context
 *   shared_league  — shares a league with the caller (casual match only)
 *   friend         — the caller is direct friends with this player
 *   recent_opp     — has played against the caller recently
 */
export type PlayerSearchTag =
  | 'in_league'
  | 'shared_league'
  | 'friend'
  | 'recent_opp';

export interface PlayerSearchItem {
  id: number;
  /** Split name parts for client rendering (e.g. last-initial). */
  first_name: string;
  last_name: string;
  /** Canonical display name; the search index + sort key. */
  full_name: string | null;
  nickname: string | null;
  initials: string;
  /** Up to three pills, in display order. */
  tags: PlayerSearchTag[];
  /** Additive relevance score (debug/telemetry; sort by response order). */
  score: number;
  /**
   * Whether this player is in the current session context. A layout signal
   * for the compact-chip group — deliberately not a pill (never in `tags`).
   */
  in_session: boolean;
  /**
   * Whether this is a placeholder/guest player (no linked user account).
   * Mirrors the backend `Player.is_placeholder` so the client seats a
   * searched guest the same way as one freshly added via "Add New Player".
   */
  is_guest: boolean;
  /** Uploaded profile photo URL (S3). Null when the player has no account or hasn't uploaded one. */
  profile_picture_url?: string | null;
}

export interface PlayerSearchResponse {
  /**
   * One bounded, deduped, relevance-ranked list: the caller's whole network
   * first, then (only on a name query) capped score-0 strangers. No cursor —
   * the client scrolls this set locally.
   */
  items: PlayerSearchItem[];
}

export interface PublicPlayerStats {
  /** Always present — the backend returns the rating regardless of privacy settings. */
  current_rating: number;
  total_games: number;
  /** Null when the player has hidden their win/loss history (game_history_visible=false). */
  total_wins: number | null;
  /** Null when the player has hidden their win/loss history (game_history_visible=false). */
  win_rate: number | null;
}

export interface PublicPlayerResponse {
  id: number;
  full_name: string;
  avatar: string | null;
  gender: PlayerGender | null;
  level: SkillLevel | null;
  /**
   * The player's own city/state (floor fields, always present when set).
   * Prefer these over the nested home-`location` record's city/state when
   * displaying where a player is based.
   */
  city?: string | null;
  state?: string | null;
  is_placeholder: boolean;
  /**
   * False when the player has opted to hide their W-L record and win rate.
   * The ELO rating (current_rating) is always returned even when this is false.
   * Clients must not compute derived win/loss values when this is false.
   */
  game_history_visible: boolean;
  /** True when the player's profile is fully private. */
  profile_is_private: boolean;
  location: {
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
    slug?: string | null;
  } | null;
  stats: PublicPlayerStats;
  league_memberships: Array<{ league_id: number; league_name: string }>;
  created_at: string | null;
  updated_at: string | null;
}

/** Request body for POST /api/players/placeholder. */
export interface CreatePlaceholderRequest {
  readonly name: string;
  /** Optional E.164 phone for the claim invite. Matches the backend schema; not yet surfaced in the mobile UI. */
  readonly phone_number?: string | null;
  readonly league_id?: number | null;
  readonly gender?: PlayerGender | null;
  readonly level?: SkillLevel | null;
}

/** Response from POST /api/players/placeholder (placeholder/guest player + claim invite). */
export interface PlaceholderPlayerResponse {
  readonly player_id: number;
  readonly name: string;
  readonly invite_token: string;
  readonly invite_url: string;
}
