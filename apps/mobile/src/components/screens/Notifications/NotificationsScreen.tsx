/**
 * NotificationsScreen — standalone notification inbox route.
 *
 * Owns the page chrome (SafeAreaView + TopNav with the "Mark all read" action)
 * and the `useNotificationsScreen` data hook, then delegates the filter bar and
 * list content to the chrome-free {@link NotificationsBody}. The same body
 * renders inside the Social hub subnav, so all list/state markup lives there.
 *
 * Wireframe ref: notifications.html
 */

import React from 'react';
import { Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import { routes } from '@/lib/navigation';
import NotificationsBody from './NotificationsBody';
import { useNotificationsScreen } from './useNotificationsScreen';

export default function NotificationsScreen(): React.ReactNode {
  const state = useNotificationsScreen();
  const { unreadCount, isLoading, onMarkAllRead } = state;

  const markAllReadAction =
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
    ) : undefined;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav
        title="Notifications"
        showBack
        backFallback={routes.home()}
        rightAction={markAllReadAction}
      />
      <NotificationsBody {...state} />
    </SafeAreaView>
  );
}
