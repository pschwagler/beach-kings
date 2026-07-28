import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notificationKeys } from './keys';
import { selectNotificationInbox } from './selectors';

const NOTIFICATION_STALE_TIME_MS = 15_000;

export const notificationQueries = {
  feed: (userId: number, enabled = true) => queryOptions({
    queryKey: notificationKeys.feed(userId),
    queryFn: () => api.getNotifications({ unreadOnly: true }),
    select: selectNotificationInbox,
    enabled: enabled && userId > 0,
    staleTime: NOTIFICATION_STALE_TIME_MS,
  }),
  unreadCount: (userId: number, enabled = true) => queryOptions({
    queryKey: notificationKeys.unreadCount(userId),
    queryFn: () => api.getUnreadNotificationCount(),
    enabled: enabled && userId > 0,
    staleTime: NOTIFICATION_STALE_TIME_MS,
  }),
};
