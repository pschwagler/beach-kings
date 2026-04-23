/**
 * Skeleton loading state for the Player Profile screen.
 */

import React from 'react';
import { View, ScrollView } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function PlayerProfileSkeleton(): React.ReactNode {
  return (
    <ScrollView
      testID="player-profile-skeleton"
      className="flex-1"
      scrollEnabled={false}
    >
      {/* Header */}
      <View className="bg-white dark:bg-elevated p-lg pb-xl items-center border-b border-border dark:border-border-strong">
        <LoadingSkeleton width={88} height={88} borderRadius={44} className="mb-sm" />
        <LoadingSkeleton width={160} height={22} borderRadius={6} className="mb-xs" />
        <LoadingSkeleton width={120} height={16} borderRadius={4} className="mb-md" />
        <View className="flex-row gap-sm">
          <LoadingSkeleton width={120} height={40} borderRadius={10} />
          <LoadingSkeleton width={100} height={40} borderRadius={10} />
        </View>
      </View>

      {/* Mutual friends */}
      <View className="bg-white dark:bg-elevated p-lg border-b border-border dark:border-border-strong">
        <LoadingSkeleton width={120} height={16} borderRadius={4} className="mb-md" />
        <View className="flex-row gap-lg">
          {[1, 2, 3].map((i) => (
            <View key={i} className="items-center gap-xs">
              <LoadingSkeleton width={44} height={44} borderRadius={22} />
              <LoadingSkeleton width={50} height={12} borderRadius={3} />
            </View>
          ))}
        </View>
      </View>

      {/* Stats */}
      <View className="bg-white dark:bg-elevated p-lg mt-sm">
        <LoadingSkeleton width={80} height={16} borderRadius={4} className="mb-md" />
        <View className="flex-row flex-wrap gap-sm">
          {[1, 2, 3, 4, 5].map((i) => (
            <LoadingSkeleton key={i} width={160} height={70} borderRadius={10} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
