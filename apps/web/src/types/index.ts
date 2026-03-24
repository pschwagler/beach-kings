/**
 * Lightweight domain interfaces for Beach Kings.
 * These define the minimal known shape of each domain object.
 * Do not add index signatures — consumers that need extra fields should use
 * type assertions or extend the interface.
 */

export interface User {
  id: number;
  phone: string;
  email?: string | null;
  phone_number?: string | null;
  created_at?: string;
  deletion_scheduled_at?: string | null;
  player?: Player;
}

export interface Player {
  id: number;
  name: string;
  full_name?: string | null;
  first_name?: string | null;
  nickname?: string | null;
  gender?: string | null;
  level?: string | null;
  city?: string | null;
  state?: string | null;
  city_latitude?: number | null;
  city_longitude?: number | null;
  avatar?: string | null;
  profile_picture_url?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  location_slug?: string | null;
  player_id?: number | null;
  is_placeholder?: boolean | null;
  league_memberships?: unknown[] | null;
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

export interface League {
  id: number;
  name: string;
  gender?: string | null;
  level?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  region_name?: string | null;
  description?: string | null;
  is_open?: boolean | null;
  is_public?: boolean | null;
  member_count?: number | null;
  games_played?: number | null;
  created_at?: string;
  standings?: unknown[] | null;
  recent_matches?: unknown[] | null;
  members?: unknown[] | null;
  home_courts?: Array<{ id: number; name?: string; [key: string]: unknown }> | null;
  current_season?: { name?: string | null } | null;
}

export interface Season {
  id: number;
  league_id: number;
  name?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  signup_deadline?: string | null;
  is_active?: boolean | null;
  awards_finalized_at?: string | null;
}

export interface Session {
  id: number;
  season_id: number;
  date?: string | null;
  status?: string | null;
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
}

export interface Match {
  id: number;
  session_id: number;
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
  elo_changes?: unknown | null;
  matchup_id?: number | null;
  court_num?: number | null;
  round_num?: number | null;
  ranked_intent?: string | null;
  phase?: string | null;
  is_ranked?: boolean | null;
  is_bye?: boolean | null;
  bracket_position?: number | null;
  game_scores?: unknown | null;
}

export interface Court {
  id: number | string;
  name: string;
  surface?: string | null;
  surface_type?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  average_rating?: number | null;
  avg_rating?: number | null;
  review_count?: number | null;
  court_count?: number | null;
  photo_count?: number | null;
  is_free?: boolean | null;
  has_lights?: boolean | null;
  has_restrooms?: boolean | null;
  has_parking?: boolean | null;
  nets_provided?: boolean | null;
  website?: string | null;
  phone?: string | null;
  parking_info?: string | null;
  hours?: string | null;
  cost_info?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  distance_miles?: number | null;
  created_at?: string;
  reviews?: unknown[] | null;
  court_photos?: unknown[] | null;
  location_id?: string | null;
  location_name?: string | null;
  location_slug?: string | null;
  top_tags?: string[] | null;
  photo_url?: string | null;
  photos?: unknown[] | null;
  tags?: unknown[] | null;
  status?: string | null;
  submitted_by?: number | null;
  submitted_by_name?: string | null;
  position?: number;
}

export interface Location {
  id: string;
  city: string;
  state: string;
  region?: string | null;
  region_id?: string | null;
  region_name?: string | null;
  name?: string | null;
  slug?: string | null;
  distance_miles?: number | null;
}
