import type { Notification } from '@beach-kings/shared';
import {
  getSocketNotification,
  upsertNotification,
} from '@/lib/notificationCache';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    user_id: 10,
    type: 'friend_request',
    title: 'Friend request',
    message: 'Taylor sent you a friend request',
    data: { request_id: 9 },
    is_read: false,
    read_at: null,
    dismissed_at: null,
    link_url: null,
    created_at: '2026-07-18T12:00:00Z',
    ...overrides,
  };
}

describe('notification Query cache helpers', () => {
  it('upserts retried WebSocket deliveries by id', () => {
    const original = makeNotification({ message: 'Original' });
    const retried = makeNotification({ message: 'Updated payload' });

    expect(upsertNotification([original], retried)).toEqual([retried]);
  });

  it('prepends a different notification without duplicating existing rows', () => {
    const first = makeNotification({ id: 1 });
    const second = makeNotification({ id: 2 });

    expect(upsertNotification([first], second).map((item) => item.id)).toEqual([2, 1]);
  });

  it('removes dismissed notifications while retaining them server-side', () => {
    const visible = makeNotification();
    const dismissed = makeNotification({ dismissed_at: '2026-07-18T12:05:00Z' });

    expect(upsertNotification([visible], dismissed)).toEqual([]);
  });

  it('accepts both payload spellings used by the WebSocket API', () => {
    const notification = makeNotification();

    expect(getSocketNotification({ type: 'notification', payload: notification }))
      .toEqual({ eventType: 'notification', notification });
    expect(getSocketNotification({ type: 'notification_updated', notification }))
      .toEqual({ eventType: 'notification_updated', notification });
  });
});
