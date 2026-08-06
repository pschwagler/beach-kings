import {
  claimNotificationPresentation,
  resetNotificationDedupeForTests,
} from '@/features/notifications/dedupe';

describe('native/WebSocket notification deduplication', () => {
  beforeEach(resetNotificationDedupeForTests);

  it('allows only one foreground presentation per notification ID', () => {
    expect(claimNotificationPresentation(42)).toBe(true);
    expect(claimNotificationPresentation(42)).toBe(false);
    expect(claimNotificationPresentation(43)).toBe(true);
  });
});
