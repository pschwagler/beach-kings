/**
 * Data and interaction hook for the Notifications screen.
 *
 * Manages:
 *   - Notifications list via api.getNotifications()
 *   - Filter tab state (all | friends | games | leagues)
 *   - Mark single notification as read via api.markNotificationRead()
 *   - Mark all as read via api.markAllNotificationsRead()
 *   - Accept/decline friend request actions surfaced from notification items
 */

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticMedium } from '@/utils/haptics';
import type { Notification, NotificationType } from '@beach-kings/shared';

export type NotificationFilter = 'all' | 'friends' | 'games' | 'leagues';

/** Maps filter labels to the NotificationTypes they include. */
const FILTER_TYPES: Record<NotificationFilter, ReadonlySet<NotificationType> | null> = {
  all: null,
  friends: new Set<NotificationType>(['friend_request', 'friend_accepted', 'direct_message']),
  games: new Set<NotificationType>([
    'session_submitted',
    'session_auto_submitted',
    'session_auto_deleted',
    'placeholder_claimed',
    'season_award',
  ]),
  leagues: new Set<NotificationType>([
    'league_message',
    'league_invite',
    'league_join_request',
    'league_join_rejected',
    'season_start',
    'season_activated',
    'member_joined',
    'member_removed',
  ]),
};

export interface UseNotificationsScreenResult {
  readonly notifications: readonly Notification[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly activeFilter: NotificationFilter;
  readonly setActiveFilter: (f: NotificationFilter) => void;
  readonly unreadCount: number;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onNotificationPress: (notification: Notification) => void;
  readonly onMarkAllRead: () => void;
  readonly onAcceptFriendRequest: (notification: Notification) => void;
  readonly onDeclineFriendRequest: (notification: Notification) => void;
}

/**
 * Returns all data and handlers for the Notifications screen.
 */
export function useNotificationsScreen(): UseNotificationsScreenResult {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data: rawNotifications,
    isLoading,
    error,
    refetch,
    mutate,
  } = useApi<Notification[]>(
    () =>
      api
        .getNotifications()
        .then((r: { items?: Notification[] } | Notification[]) =>
          Array.isArray(r) ? r : (r.items ?? []),
        ),
    [],
  );

  const notifications = useMemo<readonly Notification[]>(() => {
    const all = rawNotifications ?? [];
    const typeSet = FILTER_TYPES[activeFilter];
    if (typeSet == null) return all;
    return all.filter((n) => typeSet.has(n.type));
  }, [rawNotifications, activeFilter]);

  const unreadCount = useMemo(
    () => (rawNotifications ?? []).filter((n) => !n.is_read).length,
    [rawNotifications],
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => {
      setIsRefreshing(false);
    });
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  /** Mark a single notification read and navigate if it has a link. */
  const onNotificationPress = useCallback(
    (notification: Notification) => {
      if (!notification.is_read) {
        // Optimistic mark-read
        const prev = rawNotifications ?? [];
        mutate(
          prev.map((n) =>
            n.id === notification.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n,
          ),
        );
        api.markNotificationRead(notification.id).catch(() => {
          mutate(prev);
        });
      }
      if (notification.link_url != null && notification.link_url.length > 0) {
        // Navigate to the linked route if it's an internal path
        router.push(notification.link_url as Parameters<typeof router.push>[0]);
      }
    },
    [rawNotifications, mutate, router],
  );

  const onMarkAllRead = useCallback(() => {
    void hapticMedium();
    const prev = rawNotifications ?? [];
    const now = new Date().toISOString();
    mutate(prev.map((n) => ({ ...n, is_read: true, read_at: now })));
    api.markAllNotificationsRead().catch(() => {
      mutate(prev);
    });
  }, [rawNotifications, mutate]);

  const onAcceptFriendRequest = useCallback(
    (notification: Notification) => {
      void hapticMedium();
      const requestId = notification.data?.request_id as number | undefined;
      if (requestId == null) return;
      // Optimistic: mark notification as read
      const prev = rawNotifications ?? [];
      mutate(
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n,
        ),
      );
      api.acceptFriendRequest(requestId).catch(() => {
        mutate(prev);
      });
    },
    [rawNotifications, mutate],
  );

  const onDeclineFriendRequest = useCallback(
    (notification: Notification) => {
      void hapticMedium();
      const requestId = notification.data?.request_id as number | undefined;
      if (requestId == null) return;
      const prev = rawNotifications ?? [];
      mutate(
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n,
        ),
      );
      api.declineFriendRequest(requestId).catch(() => {
        mutate(prev);
      });
    },
    [rawNotifications, mutate],
  );

  return {
    notifications,
    isLoading,
    error,
    isRefreshing,
    activeFilter,
    setActiveFilter,
    unreadCount,
    onRefresh,
    onRetry,
    onNotificationPress,
    onMarkAllRead,
    onAcceptFriendRequest,
    onDeclineFriendRequest,
  };
}
