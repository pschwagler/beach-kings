import type { Notification } from '@beach-kings/shared';
import { QueryClient } from '@tanstack/react-query';
import {
  applyMarkAllNotificationsRead,
  applyMarkNotificationRead,
  getSocketNotification,
  reconcileNotificationEvent,
  removeFriendRequestNotifications,
  rollbackRemovedNotifications,
  rollbackMarkAllNotificationsRead,
  rollbackMarkNotificationRead,
  upsertNotification,
} from '@/features/notifications/cache';
import { notificationKeys } from '@/features/notifications/keys';

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

describe('notification cache concurrency', () => {
  function setup() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const first = makeNotification({ id: 1 });
    client.setQueryData(notificationKeys.feed(10), [first]);
    client.setQueryData(notificationKeys.unreadCount(10), { count: 9 });
    return { client, first };
  }

  it('does not duplicate socket retries or increment their unread count', () => {
    const { client, first } = setup();
    reconcileNotificationEvent(client, 10, 'notification', first);

    expect(client.getQueryData<Notification[]>(notificationKeys.feed(10)))
      .toHaveLength(1);
    expect(client.getQueryData<{ count: number }>(notificationKeys.unreadCount(10)))
      .toMatchObject({ count: 9 });
  });

  it('reconciles read and dismissed socket transitions', () => {
    const { client, first } = setup();
    reconcileNotificationEvent(client, 10, 'notification_updated', {
      ...first,
      is_read: true,
      read_at: '2026-07-18T12:01:00Z',
    });
    expect(client.getQueryData<{ count: number }>(notificationKeys.unreadCount(10)))
      .toMatchObject({ count: 8 });

    const second = makeNotification({ id: 2 });
    reconcileNotificationEvent(client, 10, 'notification', second);
    reconcileNotificationEvent(client, 10, 'notification_updated', {
      ...second,
      dismissed_at: '2026-07-18T12:02:00Z',
    });
    expect(client.getQueryData<{ count: number }>(notificationKeys.unreadCount(10)))
      .toMatchObject({ count: 8 });
    expect(client.getQueryData<Notification[]>(notificationKeys.feed(10))
      ?.some((notification) => notification.id === 2)).toBe(false);
  });

  it('invalidates the authoritative count for an unknown update', () => {
    const { client } = setup();
    reconcileNotificationEvent(
      client,
      10,
      'notification_updated',
      makeNotification({ id: 404, is_read: true }),
    );

    expect(client.getQueryState(notificationKeys.unreadCount(10))?.isInvalidated)
      .toBe(true);
  });

  it('preserves a socket delivery when mark-read fails', () => {
    const { client } = setup();
    const patch = applyMarkNotificationRead(client, 10, 1, 'mark-one');
    expect(client.getQueryData(notificationKeys.unreadCount(10))).toMatchObject({
      count: 8,
      __optimisticDeltas: { 'mark-one': -1 },
    });
    const socketNotification = makeNotification({ id: 2 });
    reconcileNotificationEvent(client, 10, 'notification', socketNotification);
    expect(client.getQueryData(notificationKeys.unreadCount(10))).toMatchObject({
      count: 9,
      __optimisticDeltas: { 'mark-one': -1 },
    });
    rollbackMarkNotificationRead(client, 10, patch);

    expect(client.getQueryData<Notification[]>(notificationKeys.feed(10))
      ?.map((notification) => notification.id)).toEqual([2, 1]);
    expect(client.getQueryData<{ count: number }>(notificationKeys.unreadCount(10)))
      .toMatchObject({ count: 10 });
  });

  it('does not restore a removed request notification over a later cache write', () => {
    const { client } = setup();
    const request = makeNotification({
      id: 7,
      type: 'friend_request',
      data: { request_id: 22 },
    });
    client.setQueryData(notificationKeys.feed(10), [request]);
    client.setQueryData(notificationKeys.unreadCount(10), { count: 1 });

    const patch = removeFriendRequestNotifications(
      client,
      10,
      { requestId: 22, notificationId: 7 },
      'accept:1',
    );
    client.setQueryData(notificationKeys.feed(10), []);
    rollbackRemovedNotifications(client, 10, patch);

    expect(client.getQueryData(notificationKeys.feed(10))).toEqual([]);
    expect(client.getQueryData(notificationKeys.unreadCount(10)))
      .toMatchObject({ count: 0 });
    expect(client.getQueryState(notificationKeys.unreadCount(10))?.isInvalidated)
      .toBe(true);
  });

  it('preserves later socket changes when mark-all fails', () => {
    const { client } = setup();
    const patch = applyMarkAllNotificationsRead(client, 10, 'mark-all');
    expect(client.getQueryData(notificationKeys.unreadCount(10))).toMatchObject({
      count: 0,
      __optimisticDeltas: { 'mark-all': -9 },
    });
    const socketNotification = makeNotification({ id: 2 });
    reconcileNotificationEvent(client, 10, 'notification', socketNotification);
    expect(client.getQueryData(notificationKeys.unreadCount(10))).toMatchObject({
      count: 1,
      __optimisticDeltas: { 'mark-all': -9 },
    });
    rollbackMarkAllNotificationsRead(client, 10, patch);

    expect(client.getQueryData<Notification[]>(notificationKeys.feed(10))
      ?.map((notification) => notification.id)).toEqual([2, 1]);
    expect(client.getQueryData<{ count: number }>(notificationKeys.unreadCount(10)))
      .toMatchObject({ count: 10 });
  });
});
