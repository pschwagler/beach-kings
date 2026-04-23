/**
 * Loading skeleton for the My Games list.
 * Renders placeholder card rows while data is being fetched.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function SkeletonCard(): React.ReactNode {
  return (
    <View className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm dark:shadow-none dark:border dark:border-border-subtle mb-3">
      {/* top row: result badge + date */}
      <View className="flex-row justify-between items-center mb-3">
        <LoadingSkeleton width={48} height={20} borderRadius={10} />
        <LoadingSkeleton width={64} height={14} borderRadius={6} />
      </View>
      {/* score */}
      <LoadingSkeleton width={80} height={28} borderRadius={6} className="mb-2" />
      {/* teams */}
      <LoadingSkeleton width="80%" height={14} borderRadius={6} className="mb-1" />
      {/* meta row */}
      <View className="flex-row justify-between mt-2 pt-2">
        <LoadingSkeleton width={120} height={12} borderRadius={6} />
        <LoadingSkeleton width={80} height={12} borderRadius={6} />
      </View>
    </View>
  );
}

interface GamesSkeletonProps {
  readonly count?: number;
}

export default function GamesSkeleton({ count = 4 }: GamesSkeletonProps): React.ReactNode {
  return (
    <View testID="games-list-loading" className="px-4 pt-3">
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
