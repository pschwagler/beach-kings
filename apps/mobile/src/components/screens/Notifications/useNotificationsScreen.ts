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

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, AppState } from 'react-native';
import { useFocusEffect, useRouter } from "expo-router";
import { hapticMedium } from "@/utils/haptics";
import { useNotifications } from '@/features/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationMutationTimeoutError } from '@/features/notifications/mutationDeadline';
import { openNotification } from '@/features/notifications/openNotification';
import { useFriendshipMutations } from '@/features/social';
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
  readonly onRetryMarkAll: () => void;
  readonly isMarkAllPending: boolean;
  readonly markAllError: string | null;
  readonly onAcceptFriendRequest: (notification: Notification) => void;
  readonly onDeclineFriendRequest: (notification: Notification) => void;
}

/**
 * Returns all data and handlers for the Notifications screen.
 */
export function useNotificationsScreen(): UseNotificationsScreenResult {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [isMarkAllPending, setIsMarkAllPending] = useState(false);
  const [markAllError, setMarkAllError] = useState<string | null>(null);
  const markAllPendingRef = useRef(false);
  const markAllGenerationRef = useRef(0);
  const userIdRef = useRef(userId);
  const {
    notifications: rawNotifications,
    isLoading,
    error,
    refetch,
    isRefetching,
    unreadCount,
    markAsRead,
    markAllAsReadAsync,
  } = useNotifications();
  const friendshipMutations = useFriendshipMutations();

  const notifications = useMemo<readonly Notification[]>(() => {
    const all = rawNotifications;
    const typeSet = FILTER_TYPES[activeFilter];
    if (typeSet == null) return all;
    return all.filter((n) => typeSet.has(n.type));
  }, [rawNotifications, activeFilter]);

  const onRefresh = useCallback(() => {
    return refetch({ cancelRefetch: false });
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch({ cancelRefetch: false });
  }, [refetch]);

  /** Mark a single notification read and navigate if it has a link. */
  const onNotificationPress = useCallback(
    (notification: Notification) => {
      openNotification(notification, (route) => router.push(route as never), (id) => {
        if (!notification.is_read) markAsRead(id);
      });
    },
    [markAsRead, router],
  );

  const retireMarkAllUi = useCallback(() => {
    markAllPendingRef.current = false;
    setIsMarkAllPending(false);
  }, []);

  const resetMarkAllUi = useCallback(() => {
    markAllGenerationRef.current += 1;
    markAllPendingRef.current = false;
    setIsMarkAllPending(false);
    setMarkAllError(null);
  }, []);

  const onMarkAllRead = useCallback(() => {
    if (markAllPendingRef.current || userId <= 0) return;
    void hapticMedium();
    const generation = markAllGenerationRef.current + 1;
    markAllGenerationRef.current = generation;
    markAllPendingRef.current = true;
    setIsMarkAllPending(true);
    setMarkAllError(null);

    void markAllAsReadAsync().then(
      () => {
        if (userIdRef.current !== userId || markAllGenerationRef.current !== generation) return;
        retireMarkAllUi();
      },
      (error: unknown) => {
        if (userIdRef.current !== userId || markAllGenerationRef.current !== generation) return;
        retireMarkAllUi();
        const message = error instanceof NotificationMutationTimeoutError
          ? 'Beach League could not confirm that all notifications were read in time.'
          : 'Beach League could not mark all notifications as read. Your unread notifications were restored.';
        setMarkAllError(message);
        AccessibilityInfo.announceForAccessibility(`${message} Retry is available.`);
      },
    );
  }, [markAllAsReadAsync, retireMarkAllUi, userId]);

  const changeFilter = useCallback((filter: NotificationFilter) => {
    resetMarkAllUi();
    setActiveFilter(filter);
  }, [resetMarkAllUi]);

  useEffect(() => {
    userIdRef.current = userId;
    resetMarkAllUi();
  }, [resetMarkAllUi, userId]);

  useFocusEffect(useCallback(() => () => resetMarkAllUi(), [resetMarkAllUi]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') resetMarkAllUi();
    });
    return () => subscription.remove();
  }, [resetMarkAllUi]);

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
    setActiveFilter: changeFilter,
    unreadCount,
    onRefresh,
    onRetry,
    onNotificationPress,
    onMarkAllRead,
    onRetryMarkAll: onMarkAllRead,
    isMarkAllPending,
    markAllError,
    onAcceptFriendRequest,
    onDeclineFriendRequest,
  };
}
