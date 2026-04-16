/**
 * Friends, direct messages, and conversation types.
 */

import type { FriendRequestStatus, SkillLevel } from './enums';

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
