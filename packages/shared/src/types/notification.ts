/**
 * Notification types.
 */

import type { NotificationType } from './enums';

export interface Notification {
  id: number;
  user_id: number;
  actor_player_id?: number | null;
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

export type PushPlatform = 'ios' | 'android';

export interface RegisterPushTokenRequest {
  token: string;
  platform: PushPlatform;
  installation_id: string;
}

export interface PushTokenRegistration {
  id: number;
  token: string;
  platform: PushPlatform;
  installation_id: string | null;
  unregister_secret: string | null;
  created_at: string;
}

export interface UnregisterPushInstallationRequest {
  installation_id: string;
  unregister_secret: string;
}

export interface NativePushData {
  notificationId: number;
  type: NotificationType;
  linkUrl: string | null;
  data: Record<string, string | number>;
}
