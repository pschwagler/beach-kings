/**
 * Notification types.
 */

import type { NotificationType } from './enums';

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  dismissed_at?: string | null;
  link_url: string | null;
  created_at: string;
}

/**
 * Per-user push notification preferences.
 *
 * `push_enabled` is the master kill-switch. When false, no push is sent
 * regardless of the per-type toggles.
 *
 * Matches the `push_notification_preferences` DB table (migration 053).
 */
export interface PushNotificationPrefs {
  push_enabled: boolean;
  direct_messages: boolean;
  league_messages: boolean;
  friend_requests: boolean;
  match_invites: boolean;
  tournament_updates: boolean;
  ranking_changes: boolean;
}
