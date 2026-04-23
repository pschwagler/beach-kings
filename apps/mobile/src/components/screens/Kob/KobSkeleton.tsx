/**
 * Loading skeleton for the KoB tournament screen.
 * Shows placeholder shapes for the tournament header, tab bar, and match cards.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function SkeletonMatchCard(): React.ReactNode {
  return (
    <View className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-sm dark:shadow-none dark:border dark:border-border-subtle mb-3 mx-4">
      {/* Court label */}
      <LoadingSkeleton width={64} height={13} borderRadius={6} className="mb-3" />
      {/* Teams row */}
      <View className="flex-row items-center justify-between mb-3">
        <LoadingSkeleton width="35%" height={16} borderRadius={6} />
        <LoadingSkeleton width={24} height={14} borderRadius={4} />
        <LoadingSkeleton width="35%" height={16} borderRadius={6} />
      </View>
      {/* Score / button row */}
      <LoadingSkeleton width={120} height={36} borderRadius={8} />
    </View>
  );
}

export default function KobSkeleton(): React.ReactNode {
  return (
    <View testID="kob-loading">
      {/* Tournament header skeleton */}
      <View className="px-4 py-4 border-b border-border dark:border-border-strong">
        <LoadingSkeleton width="60%" height={22} borderRadius={6} className="mb-2" />
        <LoadingSkeleton width={80} height={20} borderRadius={10} className="mb-2" />
        <LoadingSkeleton width={120} height={14} borderRadius={6} />
      </View>

      {/* Tab bar skeleton */}
      <View className="flex-row gap-4 px-4 py-3 border-b border-border dark:border-border-strong">
        <LoadingSkeleton width={80} height={16} borderRadius={6} />
        <LoadingSkeleton width={72} height={16} borderRadius={6} />
        <LoadingSkeleton width={88} height={16} borderRadius={6} />
      </View>

      {/* Match cards */}
      <View className="pt-4">
        <SkeletonMatchCard />
        <SkeletonMatchCard />
        <SkeletonMatchCard />
      </View>
    </View>
  );
}
