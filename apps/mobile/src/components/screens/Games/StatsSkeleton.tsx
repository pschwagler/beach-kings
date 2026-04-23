/**
 * Loading skeleton for the My Stats screen.
 * Renders placeholder blocks matching the stats screen layout.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function StatsSkeleton(): React.ReactNode {
  return (
    <View testID="stats-loading" className="flex-1">
      {/* Profile header */}
      <View className="flex-row items-center gap-4 px-4 py-4 bg-white dark:bg-dark-surface">
        <LoadingSkeleton width={56} height={56} borderRadius={28} />
        <View className="flex-1 gap-2">
          <LoadingSkeleton width={160} height={20} borderRadius={6} />
          <LoadingSkeleton width={100} height={14} borderRadius={6} />
        </View>
      </View>

      {/* Stats bar */}
      <View className="flex-row bg-white dark:bg-dark-surface border-t border-b border-gray-100 dark:border-border-subtle">
        {[1, 2, 3, 4].map((i) => (
          <View key={i} className="flex-1 items-center py-3">
            <LoadingSkeleton width={40} height={20} borderRadius={4} className="mb-1" />
            <LoadingSkeleton width={32} height={10} borderRadius={4} />
          </View>
        ))}
      </View>

      {/* Segment control */}
      <View className="mx-4 mt-3 mb-2 h-[42px] rounded-[10px] bg-gray-100 dark:bg-dark-surface overflow-hidden">
        <LoadingSkeleton width="100%" height={42} borderRadius={10} />
      </View>

      {/* Trophy row */}
      <View className="px-4 mt-2 mb-3">
        <LoadingSkeleton width={80} height={16} borderRadius={6} className="mb-3" />
        <View className="flex-row gap-3">
          {[1, 2].map((i) => (
            <LoadingSkeleton key={i} width={100} height={80} borderRadius={10} />
          ))}
        </View>
      </View>

      {/* Stats grid */}
      <View className="px-4">
        <View className="flex-row gap-3 mb-3">
          <LoadingSkeleton width="47%" height={80} borderRadius={12} />
          <LoadingSkeleton width="47%" height={80} borderRadius={12} />
        </View>
        <View className="flex-row gap-3">
          <LoadingSkeleton width="47%" height={80} borderRadius={12} />
          <LoadingSkeleton width="47%" height={80} borderRadius={12} />
        </View>
      </View>
    </View>
  );
}
