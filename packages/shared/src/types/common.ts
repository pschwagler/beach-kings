/**
 * Common/shared types: pagination, locations, awards, feedback, helpers.
 */

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total_count: number;
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

export interface SeasonAward {
  id: number;
  season_id: number;
  season_name: string | null;
  league_id: number;
  league_name: string | null;
  player_id: number;
  player_name: string | null;
  player_avatar: string | null;
  player_profile_picture_url: string | null;
  award_type: string;
  award_key: string;
  rank: number | null;
  value: number | null;
  created_at: string | null;
}

export interface Feedback {
  id: number;
  user_id: number | null;
  feedback_text: string;
  email: string | null;
  is_resolved: boolean;
  created_at: string;
  user_name: string | null;
}

export interface PlayerOption {
  value: number | string;
  label: string;
}

export interface ApiError {
  message: string;
  detail?: string;
  status?: number;
}
