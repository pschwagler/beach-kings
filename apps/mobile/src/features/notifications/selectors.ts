import type { Notification } from '@beach-kings/shared';

/**
 * The mobile notification surface is an inbox, not a history view.
 *
 * Read rows remain stored by the server, while dismissed rows remain available
 * for audit. Neither belongs in the mobile inbox.
 */
export function selectNotificationInbox(
  notifications: readonly Notification[],
): Notification[] {
  return notifications.filter(
    (notification) =>
      !notification.is_read && notification.dismissed_at == null,
  );
}
