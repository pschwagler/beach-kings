/**
 * NotificationsBody — chrome-free notification content.
 *
 * Renders everything below the TopNav: the filter tab bar and the list /
 * loading / error / empty states. Presentational — all data and handlers arrive
 * via props (the shape of {@link UseNotificationsScreenResult}) so the body can
 * be composed inside the Social hub's Notifications tab (`NotificationsTab`)
 * without re-fetching or duplicating layout.
 *
 * The "Mark all read" affordance stays in the hub's TopNav (chrome), published
 * by `NotificationsTab` via the shared header-action slot — not here.
 *
 * Wireframe ref: notifications.html
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { hapticLight } from '@/utils/haptics';
import NotificationItem from './NotificationItem';
import NotificationsSkeleton from './NotificationsSkeleton';
import NotificationsErrorState from './NotificationsErrorState';
import type {
  NotificationFilter,
  UseNotificationsScreenResult,
} from './useNotificationsScreen';
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
    <View className="flex-row bg-surface border-b border-divider">
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
                  isActive ? 'text-brand-teal' : 'text-muted'
                }`}
              >
                {label}
              </Text>
              {showBadge && (
                <View className="w-[18px] h-[18px] rounded-full bg-brand-gold items-center justify-center">
                  <Text className="text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : String(unreadCount)}
                  </Text>
                </View>
              )}
            </View>
            {isActive && (
              <View className="absolute bottom-0 left-2 right-2 h-[2px] bg-brand-teal" />
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
      <Text className="text-[18px] font-bold text-default mb-2 text-center">
        No Notifications
      </Text>
      <Text className="text-[14px] text-tertiary text-center leading-[1.5]">
        {message}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export type NotificationsBodyProps = UseNotificationsScreenResult & {
  readonly scrollRequest?: number;
};

export default function NotificationsBody({
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
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  scrollRequest = 0,
}: NotificationsBodyProps): React.ReactNode {
  const listRef = useRef<FlatList<Notification>>(null);

  useEffect(() => {
    if (scrollRequest > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [scrollRequest]);

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
        ref={listRef}
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

  return (
    <View testID="notifications-screen" className="flex-1">
      <FilterTabBar
        activeFilter={activeFilter}
        unreadCount={unreadCount}
        onFilterPress={setActiveFilter}
      />

      {renderContent()}
    </View>
  );
}
