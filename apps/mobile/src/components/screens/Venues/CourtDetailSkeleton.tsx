/**
 * Loading skeleton for the Court Detail screen.
 * Reflects the wireframe layout: hero image, header, rating, action row,
 * sections (Court Info, Photos, Leagues, Reviews).
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function CourtDetailSkeleton(): React.ReactNode {
  return (
    <View testID="court-detail-loading">
      {/* Hero image */}
      <LoadingSkeleton width="100%" height={200} borderRadius={0} />

      {/* Header */}
      <View className="px-4 pt-4 pb-3 border-b border-border dark:border-border-strong">
        <LoadingSkeleton width="70%" height={22} borderRadius={6} className="mb-2" />
        <LoadingSkeleton width="50%" height={14} borderRadius={6} className="mb-3" />
        {/* Badges */}
        <View className="flex-row gap-2">
          <LoadingSkeleton width={72} height={24} borderRadius={12} />
          <LoadingSkeleton width={64} height={24} borderRadius={12} />
          <LoadingSkeleton width={80} height={24} borderRadius={12} />
        </View>
      </View>

      {/* Rating bar */}
      <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-border-strong">
        <LoadingSkeleton width={100} height={18} borderRadius={6} className="mr-2" />
        <LoadingSkeleton width={48} height={14} borderRadius={6} />
      </View>

      {/* Action row */}
      <View className="flex-row gap-3 px-4 py-4 border-b border-border dark:border-border-strong">
        <LoadingSkeleton width="55%" height={44} borderRadius={10} />
        <LoadingSkeleton width="40%" height={44} borderRadius={10} />
      </View>

      {/* Court Info section */}
      <View className="px-4 pt-4 pb-4 border-b border-border dark:border-border-strong">
        <LoadingSkeleton width={80} height={16} borderRadius={6} className="mb-3" />
        <LoadingSkeleton width="90%" height={13} borderRadius={6} className="mb-2" />
        <LoadingSkeleton width="70%" height={13} borderRadius={6} className="mb-2" />
        <LoadingSkeleton width={160} height={100} borderRadius={8} className="mt-3" />
      </View>

      {/* Photos section */}
      <View className="px-4 pt-4 pb-4 border-b border-border dark:border-border-strong">
        <LoadingSkeleton width={64} height={16} borderRadius={6} className="mb-3" />
        <View className="flex-row gap-2">
          <LoadingSkeleton width={100} height={100} borderRadius={8} />
          <LoadingSkeleton width={100} height={100} borderRadius={8} />
          <LoadingSkeleton width={100} height={100} borderRadius={8} />
        </View>
      </View>
    </View>
  );
}
