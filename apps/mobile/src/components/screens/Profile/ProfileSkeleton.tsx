/**
 * ProfileSkeleton — shimmer placeholder while profile data loads.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function FieldSkeleton(): React.ReactNode {
  return (
    <View className="mb-md">
      <LoadingSkeleton width={80} height={10} borderRadius={3} className="mb-1" />
      <LoadingSkeleton width="100%" height={42} borderRadius={12} />
    </View>
  );
}

export default function ProfileSkeleton(): React.ReactNode {
  return (
    <View accessibilityLabel="Loading profile" accessibilityRole="none">
      {/* Header skeleton */}
      <View className="bg-white dark:bg-dark-surface items-center px-lg pt-xl pb-lg">
        <LoadingSkeleton width={88} height={88} borderRadius={44} />
        <View className="mt-md items-center gap-sm" style={{ width: '100%' }}>
          <LoadingSkeleton width={180} height={22} borderRadius={6} />
          <LoadingSkeleton width={140} height={16} borderRadius={4} />
        </View>
      </View>

      {/* Stats bar skeleton */}
      <View className="flex-row bg-white dark:bg-dark-surface border-t border-border-subtle border-b">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="flex-1 items-center py-md px-sm">
            <LoadingSkeleton width={40} height={18} borderRadius={4} />
            <View className="mt-xs">
              <LoadingSkeleton width={30} height={10} borderRadius={3} />
            </View>
          </View>
        ))}
      </View>

      {/* Fields skeleton */}
      <View className="px-lg pt-lg">
        <LoadingSkeleton width={120} height={18} borderRadius={4} className="mb-md" />
        <View className="flex-row gap-sm">
          <View className="flex-1">
            <FieldSkeleton />
          </View>
          <View className="flex-1">
            <FieldSkeleton />
          </View>
        </View>
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton />
      </View>
    </View>
  );
}
