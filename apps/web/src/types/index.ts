/**
 * Lightweight domain interfaces for Beach Kings.
 * These define the minimal known shape of each domain object.
 * Do not add index signatures — consumers that need extra fields should use
 * type assertions or extend the interface.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: number;
  phone_number: string | null;
  is_verified: boolean;
  auth_provider: string;
  profile_complete: boolean | null;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// ---------------------------------------------------------------------------
// User / Player
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'SESSION_SUBMITTED'
  | 'MATCH_ADDED'
  | 'MATCH_EDITED'
  | 'MATCH_DELETED'
  | 'SESSION_EDITED'
  | 'LEAGUE_JOINED'
  | 'PLAYER_JOINED'
  | 'SEASON_STARTED'
  | 'SEASON_ENDED'
  | 'STATS_UPDATED'
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'DIRECT_MESSAGE'
  | 'SEASON_AWARD';

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  link_url: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export interface FriendRequest {
  id: number;
  sender_player_id: number;
  sender_name: string;
  sender_avatar: string | null;
  receiver_player_id: number;
  receiver_name: string;
  receiver_avatar: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string | null;
}

export interface Friend {
  id: number;
  player_id: number;
  full_name: string;
  avatar: string | null;
  location_name: string | null;
  level: string | null;
}

export interface FriendListResponse {
  items: Friend[];
  total_count: number;
}

// ---------------------------------------------------------------------------
// Court
// ---------------------------------------------------------------------------

export interface CourtPhoto {
  id: number;
  url: string;
  caption: string | null;
  created_at: string;
}

export interface CourtReview {
  id: number;
  court_id: number;
  rating: number;
  review_text: string | null;
  author: { player_id: number; full_name: string; avatar: string | null } | null;
  tags: Array<{ id: number; name: string; category: string | null }> | null;
  photos: CourtPhoto[] | null;
  created_at: string;
  updated_at: string;
}

/** Returned by create/update/delete review endpoints. */
export interface ReviewActionResponse {
  review_id: number | null;
  average_rating: number | null;
  review_count: number;
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
  reviews?: CourtReview[] | null;
  court_photos?: CourtPhoto[] | null;
  all_photos?: CourtPhoto[] | null;
  location_id?: string | null;
  location_name?: string | null;
  location_slug?: string | null;
  top_tags?: string[] | null;
  photo_url?: string | null;
  photos?: CourtPhoto[] | null;
  tags?: unknown[] | null;
  status?: string | null;
  submitted_by?: number | null;
  submitted_by_name?: string | null;
  position?: number;
}

// ---------------------------------------------------------------------------
// League
// ---------------------------------------------------------------------------

export interface LeagueMember {
  id: number;
  league_id: number;
  player_id: number;
  role: string;
  created_at: string;
  player_name?: string | null;
  is_placeholder?: boolean | null;
}

export interface HomeCourtResponse {
  id: number;
  name: string;
  address: string | null;
  position: number;
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
  members?: LeagueMember[] | null;
  home_courts?: HomeCourtResponse[] | null;
  current_season?: { name?: string | null } | null;
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

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
  scoring_system?: string | null;
  point_system?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

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
  user_match_count?: number | null;
}

// ---------------------------------------------------------------------------
// ELO
// ---------------------------------------------------------------------------

export interface EloChange {
  elo_before: number;
  elo_after: number;
  elo_change: number;
}

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

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
  ranked_intent?: string | null;
  phase?: string | null;
  is_ranked?: boolean | null;
  is_bye?: boolean | null;
  bracket_position?: number | null;
  game_scores?: unknown | null;
  session_name?: string | null;
  session_status?: string | null;
  session_season_id?: number | null;
}

// ---------------------------------------------------------------------------
// Signup / Schedule
// ---------------------------------------------------------------------------

export interface WeeklySchedule {
  id: number;
  season_id: number;
  day_of_week: number;
  start_time: string;
  duration_hours: number;
  court_id: number | null;
  open_signups_mode: string;
  open_signups_day_of_week: number | null;
  open_signups_time: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface SignupPlayer {
  player_id: number;
  player_name: string;
  signed_up_at: string;
}

export interface Signup {
  id: number;
  season_id: number;
  weekly_schedule_id: number | null;
  scheduled_datetime: string;
  duration_hours: number;
  court_id: number | null;
  open_signups_at: string | null;
  player_count: number;
  is_open: boolean;
  is_past: boolean;
  created_at: string;
  updated_at: string;
  players: SignupPlayer[] | null;
}

// ---------------------------------------------------------------------------
// Direct Message
// ---------------------------------------------------------------------------

export interface DirectMessage {
  id: number;
  sender_player_id: number;
  receiver_player_id: number;
  message_text: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Conversation {
  player_id: number;
  full_name: string;
  avatar: string | null;
  last_message_text: string;
  last_message_at: string;
  last_message_sender_id: number;
  unread_count: number;
  is_friend: boolean;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total_count: number;
}

export interface ThreadResponse {
  messages: DirectMessage[];
  total_count: number;
  has_more?: boolean;
}

export interface MarkReadResponse {
  status: string;
  marked_count: number;
}

// ---------------------------------------------------------------------------
// KOB Tournament
// ---------------------------------------------------------------------------

export interface KobTournament {
  id: number;
  name: string;
  code: string;
  gender: string;
  format: 'FULL_ROUND_ROBIN' | 'POOLS_PLAYOFFS' | 'PARTIAL_ROUND_ROBIN' | string;
  status: 'SETUP' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  num_courts: number;
  game_to: number;
  scheduled_date: string | null;
  player_count: number;
  current_round: number | null;
  created_at: string | null;
}

export interface KobPlayer {
  id: number;
  player_id: number;
  player_name: string | null;
  player_avatar: string | null;
  seed: number | null;
  pool_id: number | null;
  is_dropped: boolean;
  dropped_at_round: number | null;
}

export interface KobMatch {
  id: number;
  matchup_id: string;
  round_num: number;
  phase: string;
  pool_id: number | null;
  court_num: number | null;
  team1_player1_id: number | null;
  team1_player2_id: number | null;
  team2_player1_id: number | null;
  team2_player2_id: number | null;
  team1_player1_name: string | null;
  team1_player2_name: string | null;
  team2_player1_name: string | null;
  team2_player2_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner: number | null;
  game_scores: Array<{ team1_score: number; team2_score: number }> | null;
  bracket_position: string | null;
  is_bye: boolean;
}

export interface KobStanding {
  player_id: number;
  player_name: string | null;
  player_avatar: string | null;
  rank: number;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  pool_id: number | null;
}

export interface KobTournamentDetail extends KobTournament {
  win_by: number;
  max_rounds: number | null;
  has_playoffs: boolean;
  playoff_size: number | null;
  num_pools: number | null;
  games_per_match: number;
  num_rr_cycles: number;
  score_cap: number | null;
  playoff_format: string | null;
  playoff_game_to: number | null;
  playoff_games_per_match: number | null;
  playoff_score_cap: number | null;
  is_ranked: boolean;
  current_phase: string | null;
  auto_advance: boolean;
  director_player_id: number | null;
  director_name: string | null;
  league_id: number | null;
  location_id: string | null;
  schedule_data: { pools?: Record<string, unknown> | null; [key: string]: unknown } | null;
  players: KobPlayer[];
  matches: KobMatch[];
  standings: KobStanding[];
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Season Awards
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export interface Feedback {
  id: number;
  user_id: number | null;
  feedback_text: string;
  email: string | null;
  is_resolved: boolean;
  created_at: string;
  user_name: string | null;
}

// ---------------------------------------------------------------------------
// Public Player / League types
// ---------------------------------------------------------------------------

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
  gender: string | null;
  level: string | null;
  is_placeholder: boolean;
  location: { id: string; name: string; slug: string | null } | null;
  stats: PublicPlayerStats;
  league_memberships: Array<{ league_id: number; league_name: string }>;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Paginated response wrapper
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total_count: number;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

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
