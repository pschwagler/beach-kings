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
  link_url: string | null;
  created_at: string;
}
