/**
 * Shimmer placeholder shown while the Leagues screen loads.
 * Renders two card-shaped skeleton blocks.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function LeagueCardSkeleton(): React.ReactNode {
  return (
    <View
      className="bg-white dark:bg-dark-surface rounded-card p-md mb-sm shadow-sm"
      accessibilityRole="none"
      accessible={false}
    >
      {/* Top row: icon + name/location + badge */}
      <View className="flex-row items-center mb-sm">
        <LoadingSkeleton width={44} height={44} borderRadius={12} />
        <View className="flex-1 ml-md gap-xs">
          <LoadingSkeleton width="70%" height={15} borderRadius={4} />
          <LoadingSkeleton width="40%" height={12} borderRadius={4} />
        </View>
        <LoadingSkeleton width={50} height={20} borderRadius={10} />
      </View>

      {/* Stats row */}
      <View className="flex-row gap-lg mt-xs">
        <View className="items-center gap-xs">
          <LoadingSkeleton width={36} height={18} borderRadius={4} />
          <LoadingSkeleton width={40} height={10} borderRadius={4} />
        </View>
        <View className="items-center gap-xs">
          <LoadingSkeleton width={44} height={18} borderRadius={4} />
          <LoadingSkeleton width={32} height={10} borderRadius={4} />
        </View>
        <View className="items-center gap-xs">
          <LoadingSkeleton width={36} height={18} borderRadius={4} />
          <LoadingSkeleton width={48} height={10} borderRadius={4} />
        </View>
      </View>

      {/* Rank bar */}
      <View className="flex-row items-center justify-between mt-md pt-md border-t border-gray-100 dark:border-border-subtle">
        <LoadingSkeleton width={80} height={22} borderRadius={10} />
        <LoadingSkeleton width={60} height={12} borderRadius={4} />
      </View>
    </View>
  );
}

export default function LeaguesSkeleton(): React.ReactNode {
  return (
    <View
      className="px-lg pt-md"
      testID="leagues-skeleton"
      accessibilityLabel="Loading leagues"
      accessibilityRole="none"
    >
      <LeagueCardSkeleton />
      <LeagueCardSkeleton />
    </View>
  );
}
