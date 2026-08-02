/**
 * NotificationsTab — Social hub container for the Notifications subnav
 * destination.
 *
 * Owns the `useNotificationsScreen` data hook and spreads it into the
 * chrome-free {@link NotificationsBody}. Mounting only while the Notifications
 * tab is active keeps its fetch lazy.
 *
 * Publishes a "Mark all" action into the shared hub TopNav when there are unread
 * notifications — the consolidated-hub home for what used to live in the
 * standalone NotificationsScreen's TopNav.
 */

import React, { useMemo } from 'react';
import { Text, Pressable } from 'react-native';
import { useNotificationsScreen } from '@/components/screens/Notifications/useNotificationsScreen';
import NotificationsBody from '@/components/screens/Notifications/NotificationsBody';
import { useHeaderAction, type SetHeaderAction } from './useHeaderAction';

interface NotificationsTabProps {
  readonly setHeaderAction?: SetHeaderAction;
  readonly scrollRequest?: number;
}

export default function NotificationsTab({
  setHeaderAction,
  scrollRequest,
}: NotificationsTabProps): React.ReactNode {
  const state = useNotificationsScreen();
  const { unreadCount, isLoading, onMarkAllRead } = state;

  const markAllAction = useMemo(
    () =>
      unreadCount > 0 && !isLoading ? (
        <Pressable
          testID="mark-all-read-btn"
          onPress={onMarkAllRead}
          accessibilityRole="button"
          accessibilityLabel="Mark all as read"
          className="min-h-touch items-center justify-center active:opacity-70"
          hitSlop={8}
        >
          <Text className="text-[12px] font-semibold text-white">Mark all</Text>
        </Pressable>
      ) : null,
    [unreadCount, isLoading, onMarkAllRead],
  );

  useHeaderAction(setHeaderAction, markAllAction);

  return <NotificationsBody {...state} scrollRequest={scrollRequest} />;
}
