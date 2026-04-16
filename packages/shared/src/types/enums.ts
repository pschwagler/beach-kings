/**
 * Shared enum/type alias definitions for Beach League.
 * These must match the backend's Python enums in models.py.
 */

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
