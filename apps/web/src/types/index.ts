/**
 * Lightweight domain interfaces for Beach League.
 * These define the minimal known shape of each domain object.
 * Do not add index signatures — consumers that need extra fields should use
 * type assertions or extend the interface.
 */

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

/** Player's personal gender identity. null = not specified / prefer not to say. */
export type PlayerGender = 'male' | 'female';

/**
 * League / tournament gender division.
 * Aligned with KoB tournament conventions (migration 038).
 */
export type LeagueGender = 'mens' | 'womens' | 'coed';

/** Canonical skill level values. */
export type SkillLevel = 'juniors' | 'beginner' | 'intermediate' | 'advanced' | 'AA' | 'Open';

/** Session lifecycle status (maps to backend SessionStatus enum). */
export type SessionStatus = 'ACTIVE' | 'SUBMITTED' | 'EDITED';

/**
 * Court moderation status.
 * NOTE: The backend DB column uses 'approved' (not 'active') for live courts.
 */
export type CourtStatus = 'pending' | 'approved' | 'rejected';

/** League member role values. */
export type LeagueMemberRole = 'admin' | 'member';

/** KOB tournament scheduling format (maps to backend TournamentFormat enum). */
export type KobTournamentFormat = 'FULL_ROUND_ROBIN' | 'POOLS_PLAYOFFS' | 'PARTIAL_ROUND_ROBIN';

/** KOB tournament lifecycle status (maps to backend TournamentStatus enum). */
export type KobTournamentStatus = 'SETUP' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/** Friend request lifecycle status. */
export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

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

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * Notification type values — must match backend NotificationType enum in models.py.
 */
export type NotificationType =
  | 'league_message'
  | 'league_invite'
  | 'league_join_request'
  | 'league_join_rejected'
  | 'season_start'
  | 'season_activated'
  | 'placeholder_claimed'
  | 'friend_request'
  | 'friend_accepted'
  | 'session_submitted'
  | 'session_auto_submitted'
  | 'session_auto_deleted'
  | 'member_joined'
  | 'member_removed'
  | 'direct_message'
  | 'season_award';

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
  status: FriendRequestStatus;
  created_at: string | null;
}

export interface Friend {
  id: number;
  player_id: number;
  full_name: string;
  avatar: string | null;
  location_name: string | null;
  level: SkillLevel | null;
}

export interface FriendListResponse {
  items: Friend[];
  total_count: number;
}

/** Minimal friend info returned inline with league query results. */
export interface FriendInLeague {
  player_id: number;
  first_name: string;
  avatar: string | null;
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
  surface_type?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  average_rating?: number | null;
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
  tags?: Array<{ id: number; name: string; category: string | null }> | null;
  status?: CourtStatus | null;
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
// MatchRecord (match history row — used by MyMatchesWidget, MyStatsTab, MyGamesTab)
// ---------------------------------------------------------------------------

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
  items: Conversation[];
  total_count: number;
}

export interface ThreadResponse {
  items: DirectMessage[];
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
  gender: LeagueGender;
  format: KobTournamentFormat;
  status: KobTournamentStatus;
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
  /** Initials-based fallback avatar (same concept as Player.avatar, prefixed for this context). */
  player_avatar: string | null;
  /** Uploaded profile picture URL (same concept as Player.profile_picture_url, prefixed). */
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
  gender: PlayerGender | null;
  level: SkillLevel | null;
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
