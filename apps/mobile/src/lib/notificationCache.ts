import type { Notification } from '@beach-kings/shared';

/**
 * Merge a socket delivery into the hydrated feed. Retried deliveries replace
 * the row with the same id instead of creating duplicate notification cards.
 */
export function upsertNotification(
  current: readonly Notification[] | undefined,
  notification: Notification,
): Notification[] {
  if (notification.dismissed_at != null) {
    return (current ?? []).filter((item) => item.id !== notification.id);
  }

  const remaining = (current ?? []).filter((item) => item.id !== notification.id);
  return [notification, ...remaining];
}

export function getSocketNotification(
  value: unknown,
): { readonly eventType: string; readonly notification: Notification } | null {
  if (value == null || typeof value !== 'object') return null;
  const object = value as Record<string, unknown>;
  const payload = object.payload ?? object.notification;
  if (typeof object.type !== 'string' || payload == null || typeof payload !== 'object') {
    return null;
  }
  const id = (payload as { readonly id?: unknown }).id;
  if (typeof id !== 'number') return null;
  return {
    eventType: object.type,
    notification: payload as Notification,
  };
}
