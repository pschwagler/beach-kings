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
}

export interface PublicPlayerStats {
  current_rating: number;
  total_games: number;
  total_wins: number;
  win_rate: number;
}

export interface PublicPlayerResponse {
  id: number;
  full_name: string;
  avatar: string | null;
  gender: PlayerGender | null;
  level: SkillLevel | null;
  is_placeholder: boolean;
  location: { id: string; name: string; slug: string | null } | null;
  stats: PublicPlayerStats;
  league_memberships: Array<{ league_id: number; league_name: string }>;
  created_at: string | null;
  updated_at: string | null;
}
