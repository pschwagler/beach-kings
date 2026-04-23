/**
 * Loading skeleton for the Find Players list.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function SkeletonPlayerRow(): React.ReactNode {
  return (
    <View className="flex-row items-center gap-3 px-4 py-[14px] bg-white dark:bg-dark-surface border-b border-border dark:border-border-strong">
      <LoadingSkeleton width={48} height={48} borderRadius={24} />
      <View className="flex-1 gap-[6px]">
        <LoadingSkeleton width={140} height={14} borderRadius={6} />
        <LoadingSkeleton width={100} height={12} borderRadius={5} />
        <View className="flex-row gap-2 mt-1">
          <LoadingSkeleton width={48} height={18} borderRadius={8} />
          <LoadingSkeleton width={64} height={18} borderRadius={8} />
        </View>
      </View>
      <LoadingSkeleton width={60} height={36} borderRadius={8} />
    </View>
  );
}

interface FindPlayersSkeletonProps {
  readonly count?: number;
}

export default function FindPlayersSkeleton({
  count = 5,
}: FindPlayersSkeletonProps): React.ReactNode {
  return (
    <View testID="find-players-loading">
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <SkeletonPlayerRow key={i} />
      ))}
    </View>
  );
}
