/**
 * Friends, direct messages, and conversation types.
 */

import type { FriendRequestStatus, SkillLevel } from './enums';

/**
 * Direction filter for GET /api/friends/requests.
 * 'incoming' = requests sent to the caller, 'outgoing' = requests sent by the
 * caller, 'both' = no filter (all requests involving the caller).
 */
export type FriendRequestDirection = 'incoming' | 'outgoing' | 'both';

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
  /** Mutual friends between the caller and the request's counterpart. */
  mutual_friends_count: number;
  /** A league shared with the counterpart, or null when none is shared. */
  shared_league_name: string | null;
}

export interface Friend {
  id: number;
  player_id: number;
  full_name: string;
  avatar: string | null;
  location_name: string | null;
  level: SkillLevel | null;
  /** A league shared with the caller, or null when none is shared. */
  shared_league_name?: string | null;
  /**
   * ISO timestamp of the friend's most recent match session (derived from
   * played games), or null when they have no recorded matches.
   */
  last_active?: string | null;
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

/** Minimal player identity returned by the mutual-friends endpoint. */
export interface MutualFriend {
  player_id: number;
  full_name: string;
  avatar: string | null;
}

export type FriendshipStatus =
  | 'self'
  | 'friend'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'none';

/** Canonical relationship state for one other player. */
export interface FriendshipRelationship {
  status: FriendshipStatus;
  /** Present only while a pending request is the source of the relationship. */
  request_id: number | null;
}

export interface FriendBatchStatusResponse {
  /** Rich relationship map used by mobile and new clients. */
  relationships: Record<string, FriendshipRelationship>;
  /** Legacy flat map retained for backwards-compatible web consumers. */
  statuses: Record<string, FriendshipStatus>;
  mutual_counts: Record<string, number>;
}

/** Filters accepted by authenticated player discovery. */
export interface DiscoverFilters {
  readonly search?: string;
  readonly location_id?: string;
  readonly gender?: 'male' | 'female';
  readonly level?: string;
  readonly sort_by?: 'mutuals' | 'games' | 'name' | 'rating';
  readonly sort_dir?: 'asc' | 'desc';
  readonly min_games?: number;
  readonly same_league?: boolean;
  readonly has_mutuals?: boolean;
  readonly page?: number;
  readonly page_size?: number;
}

/**
 * Canonical player-discovery record returned by the shared API client.
 *
 * The backend historically used both public-player names (`id`,
 * `location_name`, `total_games`) and social names (`player_id`, `city`,
 * `games_played`). The API client resolves those aliases before exposing this
 * contract to applications.
 */
export interface DiscoverPlayer {
  readonly player_id: number;
  readonly full_name: string;
  readonly avatar: string | null;
  readonly city: string | null;
  readonly level: string | null;
  readonly games_played: number;
  readonly mutual_friends_count: number;
  readonly last_active_label: string | null;
  readonly friend_status: FriendshipStatus;
  readonly request_id?: number | null;
}

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
