import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { socialApi } from '@/lib/socialApi';
import { notificationQueryKeys } from '@/lib/socialQueryKeys';

export function useNotificationQuery() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const feed = useQuery({
    queryKey: notificationQueryKeys.feed(userId),
    queryFn: socialApi.getNotifications,
    enabled: isAuthenticated && userId !== 0,
  });
  const unreadCountQuery = useQuery({
    queryKey: notificationQueryKeys.unreadCount(userId),
    queryFn: () => api.getUnreadNotificationCount(),
    enabled: isAuthenticated && userId !== 0,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => api.markNotificationRead(id),
    onMutate: async (id) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: notificationQueryKeys.feed(userId) }),
        queryClient.cancelQueries({ queryKey: notificationQueryKeys.unreadCount(userId) }),
      ]);
      const previous = queryClient.getQueryData<Notification[]>(
        notificationQueryKeys.feed(userId),
      );
      const previousCount = queryClient.getQueryData<{ count: number }>(
        notificationQueryKeys.unreadCount(userId),
      );
      const wasUnread = previous?.some(
        (notification) => notification.id === id && !notification.is_read,
      ) ?? false;
      queryClient.setQueryData<Notification[]>(
        notificationQueryKeys.feed(userId),
        (notifications) => notifications?.map((notification) =>
          notification.id === id
            ? { ...notification, is_read: true, read_at: new Date().toISOString() }
            : notification,
        ),
      );
      if (wasUnread) {
        queryClient.setQueryData<{ count: number }>(
          notificationQueryKeys.unreadCount(userId),
          (current) => ({ count: Math.max(0, (current?.count ?? 0) - 1) }),
        );
      }
      return { previous, previousCount };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(notificationQueryKeys.feed(userId), context?.previous);
      queryClient.setQueryData(
        notificationQueryKeys.unreadCount(userId),
        context?.previousCount,
      );
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.feed(userId) }),
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount(userId) }),
    ]),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: notificationQueryKeys.feed(userId) }),
        queryClient.cancelQueries({ queryKey: notificationQueryKeys.unreadCount(userId) }),
      ]);
      const previous = queryClient.getQueryData<Notification[]>(
        notificationQueryKeys.feed(userId),
      );
      const previousCount = queryClient.getQueryData<{ count: number }>(
        notificationQueryKeys.unreadCount(userId),
      );
      const now = new Date().toISOString();
      queryClient.setQueryData<Notification[]>(
        notificationQueryKeys.feed(userId),
        (notifications) => notifications?.map((notification) => ({
          ...notification,
          is_read: true,
          read_at: now,
        })),
      );
      queryClient.setQueryData(
        notificationQueryKeys.unreadCount(userId),
        { count: 0 },
      );
      return { previous, previousCount };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(notificationQueryKeys.feed(userId), context?.previous);
      queryClient.setQueryData(
        notificationQueryKeys.unreadCount(userId),
        context?.previousCount,
      );
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.feed(userId) }),
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount(userId) }),
    ]),
  });

  const notifications = feed.data ?? [];
  const hydratedFeedUnreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );
  const unreadCount = unreadCountQuery.data?.count ?? hydratedFeedUnreadCount;
  const dmUnreadCount = useMemo(
    () => notifications.filter((notification) =>
      !notification.is_read && notification.type === 'direct_message',
    ).length,
    [notifications],
  );

  const markAsReadMutate = markAsReadMutation.mutate;
  const markAllAsReadMutate = markAllAsReadMutation.mutate;
  const refetchFeed = feed.refetch;
  const refetchUnreadCount = unreadCountQuery.refetch;
  const markAsRead = useCallback((id: number) => {
    markAsReadMutate(id);
  }, [markAsReadMutate]);
  const markAllAsRead = useCallback(() => {
    markAllAsReadMutate();
  }, [markAllAsReadMutate]);
  const refetch = useCallback(
    () => Promise.all([refetchFeed(), refetchUnreadCount()]),
    [refetchFeed, refetchUnreadCount],
  );

  return {
    ...feed,
    refetch,
    isRefetching: feed.isRefetching || unreadCountQuery.isRefetching,
    notifications,
    unreadCount,
    dmUnreadCount,
    markAsRead,
    markAllAsRead,
  };
}
