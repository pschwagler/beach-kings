/**
 * Tests for useNotificationFeed — state, derived counts, listeners, and
 * `handleMessage` routing by type.
 */
import { renderHook, act } from '@testing-library/react-native';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

import useNotificationFeed, {
  type Notification,
} from '@/hooks/useNotificationFeed';

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 1,
  type: 'friend_request',
  message: 'Hello',
  is_read: false,
  created_at: '2026-04-18T00:00:00Z',
  ...overrides,
});

describe('useNotificationFeed', () => {
  it('starts with an empty list and zero counts', () => {
    const { result } = renderHook(() => useNotificationFeed());
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.dmUnreadCount).toBe(0);
  });

  it('prepends new notifications when handleMessage receives `notification`', () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 1 }),
      });
    });
    act(() => {
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 2 }),
      });
    });

    expect(result.current.notifications.map((n) => n.id)).toEqual([2, 1]);
  });

  it('counts direct_message notifications separately in dmUnreadCount', () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleMessage({
        type: 'direct_message',
        payload: makeNotification({ id: 1, type: 'direct_message' }),
      });
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 2, type: 'friend_request' }),
      });
    });

    expect(result.current.unreadCount).toBe(2);
    expect(result.current.dmUnreadCount).toBe(1);
  });

  it('markAsRead flips is_read on the matching notification only', () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 1 }),
      });
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 2 }),
      });
    });

    act(() => result.current.markAsRead(1));

    const byId = Object.fromEntries(
      result.current.notifications.map((n) => [n.id, n.is_read]),
    );
    expect(byId[1]).toBe(true);
    expect(byId[2]).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it('markAllAsRead clears unreadCount', () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 1 }),
      });
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 2 }),
      });
    });

    act(() => result.current.markAllAsRead());
    expect(result.current.unreadCount).toBe(0);
  });

  it('replaces an existing notification when handleMessage receives `notification_updated`', () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 1, message: 'Old' }),
      });
    });
    act(() => {
      result.current.handleMessage({
        type: 'notification_updated',
        payload: makeNotification({ id: 1, message: 'New', is_read: true }),
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]?.message).toBe('New');
    expect(result.current.notifications[0]?.is_read).toBe(true);
  });

  it('ignores malformed payloads', () => {
    const { result } = renderHook(() => useNotificationFeed());
    act(() => {
      result.current.handleMessage(null);
      result.current.handleMessage('not an object');
      result.current.handleMessage({ type: 'notification' }); // missing payload
    });
    expect(result.current.notifications).toEqual([]);
  });

  it('addNotificationListener fires only for matching type', () => {
    const { result } = renderHook(() => useNotificationFeed());
    const dmListener = jest.fn();
    const friendListener = jest.fn();

    let unsubDm: () => void = () => {};
    let unsubFriend: () => void = () => {};
    act(() => {
      unsubDm = result.current.addNotificationListener('direct_message', dmListener);
      unsubFriend = result.current.addNotificationListener('friend_request', friendListener);
    });

    act(() => {
      result.current.handleMessage({
        type: 'direct_message',
        payload: makeNotification({ id: 1, type: 'direct_message' }),
      });
    });

    expect(dmListener).toHaveBeenCalledTimes(1);
    expect(friendListener).not.toHaveBeenCalled();

    act(() => {
      unsubDm();
      unsubFriend();
    });
  });

  it('addNotificationListener returns an unsubscribe that stops further calls', () => {
    const { result } = renderHook(() => useNotificationFeed());
    const listener = jest.fn();

    let unsub: () => void = () => {};
    act(() => {
      unsub = result.current.addNotificationListener('friend_request', listener);
    });

    act(() => {
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 1, type: 'friend_request' }),
      });
    });
    expect(listener).toHaveBeenCalledTimes(1);

    act(() => unsub());

    act(() => {
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 2, type: 'friend_request' }),
      });
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reset empties the notifications list', () => {
    const { result } = renderHook(() => useNotificationFeed());
    act(() => {
      result.current.handleMessage({
        type: 'notification',
        payload: makeNotification({ id: 1 }),
      });
    });
    expect(result.current.notifications).toHaveLength(1);

    act(() => result.current.reset());
    expect(result.current.notifications).toEqual([]);
  });
});
