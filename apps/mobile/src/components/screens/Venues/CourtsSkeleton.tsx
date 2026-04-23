/**
 * Loading skeleton for the Courts list screen.
 * Renders placeholder court rows while data is being fetched.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function SkeletonCourtRow(): React.ReactNode {
  return (
    <View className="flex-row items-center py-3 px-4 border-b border-border dark:border-border-strong">
      {/* Thumbnail */}
      <LoadingSkeleton width={72} height={72} borderRadius={8} />
      <View className="flex-1 ml-3">
        {/* Name */}
        <LoadingSkeleton width="60%" height={16} borderRadius={6} className="mb-2" />
        {/* City */}
        <LoadingSkeleton width="40%" height={13} borderRadius={6} className="mb-2" />
        {/* Rating row */}
        <View className="flex-row gap-2">
          <LoadingSkeleton width={80} height={12} borderRadius={6} />
          <LoadingSkeleton width={48} height={12} borderRadius={6} />
        </View>
      </View>
      {/* Chevron */}
      <LoadingSkeleton width={16} height={16} borderRadius={4} />
    </View>
  );
}

interface CourtsSkeletonProps {
  readonly count?: number;
}

export default function CourtsSkeleton({ count = 5 }: CourtsSkeletonProps): React.ReactNode {
  return (
    <View testID="courts-list-loading">
      {/* Filter chips skeleton */}
      <View className="flex-row gap-2 px-4 py-3 border-b border-border dark:border-border-strong">
        {[80, 96, 88, 72, 80, 72].map((w, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <LoadingSkeleton key={i} width={w} height={32} borderRadius={16} />
        ))}
      </View>
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <SkeletonCourtRow key={i} />
      ))}
    </View>
  );
}
