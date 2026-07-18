import type { Notification } from '@beach-kings/shared';
import type { QueryClient } from '@tanstack/react-query';
import { notificationKeys } from './keys';

interface NotificationCountCache {
  readonly count: number;
  readonly __optimisticDeltas?: Readonly<Record<string, number>>;
}

export interface NotificationMutationInput {
  readonly requestId: number;
  readonly notificationId?: number;
}

export interface RemovedNotificationPatch {
  readonly token: string;
  readonly removed: ReadonlyArray<{
    readonly notification: Notification;
    /** Entity-local tombstone written by this mutation. */
    readonly optimistic: Notification & {
      readonly __optimisticMutation: string;
    };
  }>;
}

export interface MarkNotificationReadPatch {
  readonly token: string;
  readonly notificationId: number;
  readonly previous: Notification | undefined;
  readonly optimistic: Notification | undefined;
}

export interface MarkAllNotificationsReadPatch {
  readonly token: string;
  readonly marked: ReadonlyArray<{
    readonly previous: Notification;
    readonly optimistic: Notification;
  }>;
}

export function notificationRequestId(notification: Notification): number | null {
  const value = notification.data?.friend_request_id ?? notification.data?.request_id;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Merge socket data by id, dropping dismissed rows from the visible feed. */
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
  return { eventType: object.type, notification: payload as Notification };
}

function applyOptimisticUnreadDelta(
  queryClient: QueryClient,
  userId: number,
  token: string,
  requestedDelta: number,
): void {
  queryClient.setQueryData<NotificationCountCache>(
    notificationKeys.unreadCount(userId),
    (current) => {
      if (current == null || requestedDelta === 0) return current;
      const nextCount = Math.max(0, current.count + requestedDelta);
      const appliedDelta = nextCount - current.count;
      if (appliedDelta === 0) return current;
      return {
        ...current,
        count: nextCount,
        __optimisticDeltas: {
          ...current.__optimisticDeltas,
          [token]: appliedDelta,
        },
      };
    },
  );
}

function finishOptimisticUnreadDelta(
  queryClient: QueryClient,
  userId: number,
  token: string,
  restoreAmount?: number,
): boolean {
  let found = false;
  queryClient.setQueryData<NotificationCountCache>(
    notificationKeys.unreadCount(userId),
    (current) => {
      const delta = current?.__optimisticDeltas?.[token];
      if (current == null || delta == null) return current;
      found = true;
      const { [token]: _removed, ...remaining } = current.__optimisticDeltas ?? {};
      const requestedRestore = restoreAmount == null ? -delta : restoreAmount;
      const boundedRestore = delta < 0
        ? Math.min(requestedRestore, -delta)
        : requestedRestore;
      return {
        count: Math.max(
          0,
          current.count + boundedRestore,
        ),
        ...(Object.keys(remaining).length > 0
          ? { __optimisticDeltas: remaining }
          : {}),
      };
    },
  );
  return found;
}

function adjustUnreadCount(
  queryClient: QueryClient,
  userId: number,
  delta: number,
): void {
  if (delta === 0) return;
  queryClient.setQueryData<NotificationCountCache>(
    notificationKeys.unreadCount(userId),
    (current) => ({
      ...(current ?? { count: 0 }),
      count: Math.max(0, (current?.count ?? 0) + delta),
    }),
  );
}

export function removeFriendRequestNotifications(
  queryClient: QueryClient,
  userId: number,
  input: NotificationMutationInput,
  token: string,
): RemovedNotificationPatch {
  const current = queryClient.getQueryData<Notification[]>(notificationKeys.feed(userId));
  const removed = (current ?? []).flatMap((notification) => (
    notification.id === input.notificationId ||
    notificationRequestId(notification) === input.requestId
      ? [{
          notification,
          optimistic: {
            ...notification,
            dismissed_at: `optimistic:${token}`,
            __optimisticMutation: token,
          },
        }]
      : []
  ));
  if (current != null && removed.length > 0) {
    const optimisticById = new Map(
      removed.map((entry) => [entry.notification.id, entry.optimistic]),
    );
    queryClient.setQueryData<Notification[]>(
      notificationKeys.feed(userId),
      current.map((notification) =>
        optimisticById.get(notification.id) ?? notification,
      ),
    );
    const unreadRemoved = removed.filter(({ notification }) => !notification.is_read).length;
    applyOptimisticUnreadDelta(queryClient, userId, token, -unreadRemoved);
  }
  const stored = queryClient.getQueryData<Notification[]>(
    notificationKeys.feed(userId),
  );
  return {
    token,
    removed: removed.map((entry) => {
      const optimistic = stored?.find((notification) =>
        notification.id === entry.notification.id &&
        notification.dismissed_at === `optimistic:${token}`
      ) as typeof entry.optimistic | undefined;
      return { ...entry, optimistic: optimistic ?? entry.optimistic };
    }),
  };
}

export function rollbackRemovedNotifications(
  queryClient: QueryClient,
  userId: number,
  patch: RemovedNotificationPatch,
): void {
  if (patch.removed.length === 0) return;
  const feedKey = notificationKeys.feed(userId);
  let restoredUnread = 0;
  const removedById = new Map(
    patch.removed.map((entry) => [entry.notification.id, entry]),
  );
  queryClient.setQueryData<Notification[]>(feedKey, (current) =>
    current?.map((notification) => {
      const removed = removedById.get(notification.id);
      if (removed == null || notification !== removed.optimistic) {
        return notification;
      }
      if (!removed.notification.is_read) restoredUnread += 1;
      return removed.notification;
    }),
  );
  finishOptimisticUnreadDelta(
    queryClient,
    userId,
    patch.token,
    restoredUnread,
  );
  const unreadRemoved = patch.removed.filter(
    ({ notification }) => !notification.is_read,
  ).length;
  if (restoredUnread < unreadRemoved) {
    void queryClient.invalidateQueries({
      queryKey: notificationKeys.unreadCount(userId),
    });
  }
}

export function applyMarkNotificationRead(
  queryClient: QueryClient,
  userId: number,
  notificationId: number,
  token: string,
): MarkNotificationReadPatch {
  const current = queryClient.getQueryData<Notification[]>(
    notificationKeys.feed(userId),
  );
  const previous = current?.find((notification) => notification.id === notificationId);
  let optimistic: Notification | undefined;
  if (previous != null && !previous.is_read) {
    optimistic = {
      ...previous,
      is_read: true,
      read_at: `optimistic:${token}`,
    };
    queryClient.setQueryData<Notification[]>(
      notificationKeys.feed(userId),
      (notifications) => notifications?.map((notification) =>
        notification.id === notificationId
          ? optimistic as Notification
          : notification,
      ),
    );
    applyOptimisticUnreadDelta(queryClient, userId, token, -1);
  }
  return { token, notificationId, previous, optimistic };
}

export function rollbackMarkNotificationRead(
  queryClient: QueryClient,
  userId: number,
  patch: MarkNotificationReadPatch,
): void {
  let restoredUnread = 0;
  queryClient.setQueryData<Notification[]>(
    notificationKeys.feed(userId),
    (current) => current?.map((notification) => {
      if (
        notification.id !== patch.notificationId ||
        notification.read_at !== `optimistic:${patch.token}` ||
        patch.previous == null
      ) return notification;
      if (!patch.previous.is_read) restoredUnread = 1;
      return patch.previous;
    }),
  );
  finishOptimisticUnreadDelta(queryClient, userId, patch.token, restoredUnread);
}

export function commitMarkNotificationRead(
  queryClient: QueryClient,
  userId: number,
  patch: MarkNotificationReadPatch,
  notification: Notification,
): void {
  queryClient.setQueryData<Notification[]>(
    notificationKeys.feed(userId),
    (current) => current?.map((candidate) =>
      candidate.id === patch.notificationId &&
      candidate.read_at === `optimistic:${patch.token}`
        ? notification
        : candidate),
  );
  finishOptimisticUnreadDelta(queryClient, userId, patch.token, 0);
}

export function applyMarkAllNotificationsRead(
  queryClient: QueryClient,
  userId: number,
  token: string,
): MarkAllNotificationsReadPatch {
  const marked: Array<{ previous: Notification; optimistic: Notification }> = [];
  queryClient.setQueryData<Notification[]>(
    notificationKeys.feed(userId),
    (current) => current?.map((notification) => {
      if (notification.is_read) return notification;
      const optimistic: Notification = {
        ...notification,
        is_read: true,
        read_at: `optimistic:${token}`,
      };
      marked.push({ previous: notification, optimistic });
      return optimistic;
    }),
  );
  const count = queryClient.getQueryData<NotificationCountCache>(
    notificationKeys.unreadCount(userId),
  )?.count;
  if (count != null) applyOptimisticUnreadDelta(queryClient, userId, token, -count);
  return { token, marked };
}

export function rollbackMarkAllNotificationsRead(
  queryClient: QueryClient,
  userId: number,
  patch: MarkAllNotificationsReadPatch,
): void {
  const markedById = new Map(
    patch.marked.map((entry) => [entry.previous.id, entry]),
  );
  let allOptimisticRowsIntact = true;
  queryClient.setQueryData<Notification[]>(
    notificationKeys.feed(userId),
    (current) => {
      if (current == null) return current;
      const currentById = new Map(current.map((notification) => [notification.id, notification]));
      for (const [id, marked] of markedById) {
        if (currentById.get(id)?.read_at !== `optimistic:${patch.token}`) {
          allOptimisticRowsIntact = false;
        }
      }
      return current.map((notification) => {
        const marked = markedById.get(notification.id);
        return marked != null && notification.read_at === `optimistic:${patch.token}`
          ? marked.previous
          : notification;
      });
    },
  );
  if (allOptimisticRowsIntact) {
    finishOptimisticUnreadDelta(queryClient, userId, patch.token);
  } else {
    finishOptimisticUnreadDelta(queryClient, userId, patch.token, 0);
    void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(userId) });
  }
}

export function commitMarkAllNotificationsRead(
  queryClient: QueryClient,
  userId: number,
  patch: MarkAllNotificationsReadPatch,
): void {
  const committedAt = new Date().toISOString();
  queryClient.setQueryData<Notification[]>(
    notificationKeys.feed(userId),
    (current) => current?.map((notification) =>
      notification.read_at === `optimistic:${patch.token}`
        ? { ...notification, read_at: committedAt }
        : notification),
  );
  finishOptimisticUnreadDelta(queryClient, userId, patch.token, 0);
}

export function reconcileNotificationEvent(
  queryClient: QueryClient,
  userId: number,
  eventType: string,
  notification: Notification,
): void {
  const feedKey = notificationKeys.feed(userId);
  const countKey = notificationKeys.unreadCount(userId);
  const current = queryClient.getQueryData<Notification[]>(feedKey);
  const feedWasHydrated = current != null;
  const countWasHydrated = queryClient.getQueryData(countKey) != null;
  const existing = current?.find((item) => item.id === notification.id);
  const optimisticToken = existing?.read_at?.startsWith('optimistic:')
    ? existing.read_at.slice('optimistic:'.length)
    : undefined;
  const wasUnread = existing != null && existing.dismissed_at == null && !existing.is_read;
  const isUnread = notification.dismissed_at == null && !notification.is_read;

  queryClient.setQueryData<Notification[]>(
    feedKey,
    (notifications) => upsertNotification(notifications, notification),
  );

  if (optimisticToken != null) {
    finishOptimisticUnreadDelta(queryClient, userId, optimisticToken, 0);
    void queryClient.invalidateQueries({ queryKey: countKey });
  } else if (eventType === 'notification_updated' && existing == null) {
    void queryClient.invalidateQueries({ queryKey: countKey });
  } else {
    adjustUnreadCount(queryClient, userId, Number(isUnread) - Number(wasUnread));
  }

  if (!feedWasHydrated) {
    void queryClient.invalidateQueries({ queryKey: feedKey });
  }
  if (!countWasHydrated) {
    void queryClient.invalidateQueries({ queryKey: countKey });
  }
}
