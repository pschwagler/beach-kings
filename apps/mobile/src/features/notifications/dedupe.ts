const SEEN_FOR_MS = 5 * 60 * 1000;
const seen = new Map<number, number>();

/** Claim one foreground presentation across WebSocket and native delivery. */
export function claimNotificationPresentation(notificationId: number): boolean {
  const now = Date.now();
  for (const [id, timestamp] of seen) {
    if (now - timestamp > SEEN_FOR_MS) seen.delete(id);
  }
  if (seen.has(notificationId)) return false;
  seen.set(notificationId, now);
  return true;
}

export function resetNotificationDedupeForTests(): void {
  seen.clear();
}
