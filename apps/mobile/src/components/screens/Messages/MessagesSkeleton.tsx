/**
 * Loading skeleton for the Messages inbox list.
 * Renders placeholder conversation rows while data is fetched.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function SkeletonRow(): React.ReactNode {
  return (
    <View className="flex-row items-center gap-3 px-4 py-[14px] bg-white dark:bg-dark-surface border-b border-border dark:border-border-strong">
      {/* Avatar */}
      <LoadingSkeleton width={48} height={48} borderRadius={24} />
      {/* Body */}
      <View className="flex-1 gap-[6px]">
        <View className="flex-row justify-between items-center">
          <LoadingSkeleton width={120} height={14} borderRadius={6} />
          <LoadingSkeleton width={48} height={11} borderRadius={4} />
        </View>
        <LoadingSkeleton width="85%" height={13} borderRadius={5} />
      </View>
    </View>
  );
}

interface MessagesSkeletonProps {
  readonly count?: number;
}

export default function MessagesSkeleton({
  count = 5,
}: MessagesSkeletonProps): React.ReactNode {
  return (
    <View testID="messages-loading">
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
