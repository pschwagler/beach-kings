/**
 * NotificationsScreen — main notification inbox.
 *
 * Renders:
 *   - Filter tab bar (All / Friends / Games / Leagues)
 *   - "Mark all read" button when there are unread notifications
 *   - List of NotificationItem rows
 *   - Skeleton while loading
 *   - Error state with retry
 *   - Empty state per filter
 *
 * Wireframe ref: notifications.html
 */

import React from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticLight } from '@/utils/haptics';
import TopNav from '@/components/ui/TopNav';
import NotificationItem from './NotificationItem';
import NotificationsSkeleton from './NotificationsSkeleton';
import NotificationsErrorState from './NotificationsErrorState';
import { useNotificationsScreen } from './useNotificationsScreen';
import type { NotificationFilter } from './useNotificationsScreen';
import type { Notification } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Filter tab bar
// ---------------------------------------------------------------------------

const FILTER_TABS: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'friends', label: 'Friends' },
  { key: 'games', label: 'Games' },
  { key: 'leagues', label: 'Leagues' },
];

interface FilterTabBarProps {
  readonly activeFilter: NotificationFilter;
  readonly unreadCount: number;
  readonly onFilterPress: (filter: NotificationFilter) => void;
}

function FilterTabBar({
  activeFilter,
  unreadCount,
  onFilterPress,
}: FilterTabBarProps): React.ReactNode {
  return (
    <View className="flex-row bg-white dark:bg-dark-surface border-b border-[#f0f0f0] dark:border-border-strong">
      {FILTER_TABS.map(({ key, label }) => {
        const isActive = key === activeFilter;
        const showBadge = key === 'all' && unreadCount > 0;
        return (
          <Pressable
            key={key}
            testID={`filter-tab-${key}`}
            onPress={() => {
              void hapticLight();
              onFilterPress(key);
            }}
            className="flex-1 py-[14px] items-center justify-center"
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <View className="flex-row items-center gap-1">
              <Text
                className={`text-[13px] font-semibold ${
                  isActive
                    ? 'text-[#1a3a4a] dark:text-brand-teal'
                    : 'text-text-secondary dark:text-content-secondary'
                }`}
              >
                {label}
              </Text>
              {showBadge && (
                <View className="w-[18px] h-[18px] rounded-full bg-[#c0892a] dark:bg-brand-gold items-center justify-center">
                  <Text className="text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : String(unreadCount)}
                  </Text>
                </View>
              )}
            </View>
            {isActive && (
              <View className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#1a3a4a] dark:bg-brand-teal" />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function NotificationsEmptyState({
  filter,
}: {
  filter: NotificationFilter;
}): React.ReactNode {
  const message =
    filter === 'all'
      ? "You're all caught up! No notifications yet."
      : `No ${filter} notifications.`;

  return (
    <View
      testID="notifications-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <Text className="text-[18px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
        No Notifications
      </Text>
      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.5]">
        {message}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function NotificationsScreen(): React.ReactNode {
  const {
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
  } = useNotificationsScreen();

  const renderContent = (): React.ReactNode => {
    if (isLoading && !isRefreshing) {
      return <NotificationsSkeleton count={6} />;
    }
    if (error != null && !isRefreshing) {
      return <NotificationsErrorState onRetry={onRetry} />;
    }
    if (notifications.length === 0) {
      return <NotificationsEmptyState filter={activeFilter} />;
    }

    return (
      <FlatList<Notification>
        testID="notifications-list"
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={onNotificationPress}
            onAcceptFriendRequest={onAcceptFriendRequest}
            onDeclineFriendRequest={onDeclineFriendRequest}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      />
    );
  };

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
    <SafeAreaView
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Notifications" showBack rightAction={markAllReadAction} />
      <View testID="notifications-screen" className="flex-1">
        <FilterTabBar
          activeFilter={activeFilter}
          unreadCount={unreadCount}
          onFilterPress={setActiveFilter}
        />

        {renderContent()}
      </View>
    </SafeAreaView>
  );
}
