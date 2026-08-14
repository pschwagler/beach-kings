import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  applyMarkAllNotificationsRead,
  applyMarkNotificationRead,
  commitMarkAllNotificationsRead,
  commitMarkNotificationRead,
  rollbackMarkAllNotificationsRead,
  rollbackMarkNotificationRead,
} from './cache';
import { notificationKeys } from './keys';
import { notificationQueries } from './queries';
import { messageQueries } from '@/features/messages';

let optimisticSequence = 0;
const EMPTY_NOTIFICATIONS: readonly Notification[] = [];

function nextOptimisticToken(action: string): string {
  optimisticSequence += 1;
  return `${action}:${optimisticSequence}`;
}

/** Query-backed notification state. This hook does not require a provider. */
export function useNotifications() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  const enabled = isAuthenticated && userId > 0;
  const queryClient = useQueryClient();
  const feed = useQuery(notificationQueries.feed(userId, enabled));
  const unreadCountQuery = useQuery(notificationQueries.unreadCount(userId, enabled));
  const dmUnreadCountQuery = useQuery(messageQueries.unreadCount(userId, enabled));

  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => api.markNotificationRead(id),
    onMutate: async (id) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: notificationKeys.feed(userId) }),
        queryClient.cancelQueries({ queryKey: notificationKeys.unreadCount(userId) }),
      ]);
      return applyMarkNotificationRead(
        queryClient,
        userId,
        id,
        nextOptimisticToken('mark-read'),
      );
    },
    onError: (_error, _id, patch) => {
      if (patch != null) rollbackMarkNotificationRead(queryClient, userId, patch);
    },
    onSuccess: (notification, _id, patch) => {
      if (patch != null) {
        commitMarkNotificationRead(queryClient, userId, patch, notification);
      }
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationKeys.feed(userId) }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(userId) }),
    ]),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: notificationKeys.feed(userId) }),
        queryClient.cancelQueries({ queryKey: notificationKeys.unreadCount(userId) }),
      ]);
      return applyMarkAllNotificationsRead(
        queryClient,
        userId,
        nextOptimisticToken('mark-all-read'),
      );
    },
    onError: (_error, _variables, patch) => {
      if (patch != null) rollbackMarkAllNotificationsRead(queryClient, userId, patch);
    },
    onSuccess: (_response, _variables, patch) => {
      if (patch != null) commitMarkAllNotificationsRead(queryClient, userId, patch);
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationKeys.feed(userId) }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(userId) }),
    ]),
  });

  const notifications = feed.data ?? EMPTY_NOTIFICATIONS;
  const hydratedFeedUnreadCount = notifications.length;
  const unreadCount = unreadCountQuery.data?.count ?? hydratedFeedUnreadCount;
  const hydratedDmSummaryCount = useMemo(
    () => notifications.filter((notification) =>
      notification.type === 'direct_message',
    ).length,
    [notifications],
  );
  const dmUnreadCount =
    dmUnreadCountQuery.data?.count ?? hydratedDmSummaryCount;

  const markAsReadMutate = markAsReadMutation.mutate;
  const markAllAsReadMutate = markAllAsReadMutation.mutate;
  const refetchFeed = feed.refetch;
  const refetchUnreadCount = unreadCountQuery.refetch;
  const refetchDmUnreadCount = dmUnreadCountQuery.refetch;
  const markAsRead = useCallback((id: number) => {
    markAsReadMutate(id);
  }, [markAsReadMutate]);
  const markAllAsRead = useCallback(() => {
    markAllAsReadMutate();
  }, [markAllAsReadMutate]);
  const refetch = useCallback(
    () => Promise.all([
      refetchFeed(),
      refetchUnreadCount(),
      refetchDmUnreadCount(),
    ]),
    [refetchDmUnreadCount, refetchFeed, refetchUnreadCount],
  );

  return {
    ...feed,
    refetch,
    isRefetching:
      feed.isRefetching ||
      unreadCountQuery.isRefetching ||
      dmUnreadCountQuery.isRefetching,
    notifications,
    unreadCount,
    dmUnreadCount,
    markAsRead,
    markAllAsRead,
  };
}
