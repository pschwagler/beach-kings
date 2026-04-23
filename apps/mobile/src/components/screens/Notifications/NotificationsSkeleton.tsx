/**
 * Loading skeleton for the Notifications list.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function SkeletonNotificationRow(): React.ReactNode {
  return (
    <View className="flex-row items-start gap-3 px-4 py-[14px] bg-white dark:bg-dark-surface border-b border-border dark:border-border-strong">
      <LoadingSkeleton width={44} height={44} borderRadius={22} />
      <View className="flex-1 gap-[6px] pt-[2px]">
        <LoadingSkeleton width={180} height={14} borderRadius={6} />
        <LoadingSkeleton width={240} height={12} borderRadius={5} />
        <LoadingSkeleton width={80} height={11} borderRadius={5} />
      </View>
    </View>
  );
}

interface NotificationsSkeletonProps {
  readonly count?: number;
}

export default function NotificationsSkeleton({
  count = 5,
}: NotificationsSkeletonProps): React.ReactNode {
  return (
    <View testID="notifications-loading">
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <SkeletonNotificationRow key={i} />
      ))}
    </View>
  );
}
