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

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { hapticMedium } from "@/utils/haptics";
import { useNotificationQuery } from '@/hooks/useNotificationQuery';
import { useFriendshipMutations } from '@/hooks/useFriendshipMutations';
import type { Notification, NotificationType } from "@beach-kings/shared";

export type NotificationFilter = "all" | "friends" | "games" | "leagues";

function getFriendRequestId(notification: Notification): number | null {
  const value =
    notification.data?.friend_request_id ?? notification.data?.request_id;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

/** Maps filter labels to the NotificationTypes they include. */
const FILTER_TYPES: Record<
  NotificationFilter,
  ReadonlySet<NotificationType> | null
> = {
  all: null,
  friends: new Set<NotificationType>([
    "friend_request",
    "friend_accepted",
    "direct_message",
  ]),
  games: new Set<NotificationType>([
    "session_submitted",
    "session_auto_submitted",
    "session_auto_deleted",
    "placeholder_claimed",
    "season_award",
  ]),
  leagues: new Set<NotificationType>([
    "league_message",
    "league_invite",
    "league_join_request",
    "league_join_rejected",
    "season_start",
    "season_activated",
    "member_joined",
    "member_removed",
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
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const {
    notifications: rawNotifications,
    isLoading,
    error,
    refetch,
    isRefetching,
    markAsRead,
    markAllAsRead,
  } = useNotificationQuery();
  const friendshipMutations = useFriendshipMutations();

  const notifications = useMemo<readonly Notification[]>(() => {
    const all = rawNotifications;
    const typeSet = FILTER_TYPES[activeFilter];
    if (typeSet == null) return all;
    return all.filter((n) => typeSet.has(n.type));
  }, [rawNotifications, activeFilter]);

  const unreadCount = useMemo(
    () => rawNotifications.filter((notification) => !notification.is_read).length,
    [rawNotifications],
  );

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  /** Mark a single notification read and navigate if it has a link. */
  const onNotificationPress = useCallback(
    (notification: Notification) => {
      if (!notification.is_read) {
        markAsRead(notification.id);
      }
      if (notification.link_url != null && notification.link_url.length > 0) {
        // Navigate to the linked route if it's an internal path
        router.push(notification.link_url as Parameters<typeof router.push>[0]);
      }
    },
    [markAsRead, router],
  );

  const onMarkAllRead = useCallback(() => {
    void hapticMedium();
    markAllAsRead();
  }, [markAllAsRead]);

  const onAcceptFriendRequest = useCallback(
    (notification: Notification) => {
      void hapticMedium();
      const requestId = getFriendRequestId(notification);
      if (requestId == null) return;
      friendshipMutations.accept.mutate({
        requestId,
        notificationId: notification.id,
      });
    },
    [friendshipMutations.accept],
  );

  const onDeclineFriendRequest = useCallback(
    (notification: Notification) => {
      void hapticMedium();
      const requestId = getFriendRequestId(notification);
      if (requestId == null) return;
      friendshipMutations.decline.mutate({
        requestId,
        notificationId: notification.id,
      });
    },
    [friendshipMutations.decline],
  );

  return {
    notifications,
    isLoading,
    error,
    isRefreshing: isRefetching,
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
