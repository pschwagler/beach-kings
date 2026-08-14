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
import { View, FlatList, RefreshControl } from 'react-native';
import { hapticLight } from '@/utils/haptics';
import TabView from '@/components/ui/TabView';
import EmptyState from '@/components/ui/EmptyState';
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

interface NotificationsTabsProps {
  readonly activeFilter: NotificationFilter;
  readonly unreadCount: number;
  readonly onFilterPress: (filter: NotificationFilter) => void;
}

function NotificationsTabs({
  activeFilter,
  unreadCount,
  onFilterPress,
}: NotificationsTabsProps): React.ReactNode {
  return (
    <TabView<NotificationFilter>
      testID="notifications-filter-tabs"
      items={FILTER_TABS.map(({ key, label }) => ({
        value: key,
        label,
        badge:
          key === 'all' && unreadCount > 0
            ? unreadCount > 9 ? '9+' : String(unreadCount)
            : undefined,
        testID: `filter-tab-${key}`,
      }))}
      value={activeFilter}
      onValueChange={(value) => {
        void hapticLight();
        onFilterPress(value);
      }}
    />
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
    <EmptyState
      testID="notifications-empty-state"
      title="No Notifications"
      description={message}
    />
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
      <NotificationsTabs
        activeFilter={activeFilter}
        unreadCount={unreadCount}
        onFilterPress={setActiveFilter}
      />

      {renderContent()}
    </View>
  );
}
