/**
 * SessionDetailSkeleton — placeholder shimmer shown while session data loads.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function SessionDetailSkeleton(): React.ReactNode {
  return (
    <View testID="session-detail-loading" className="px-[16px] pt-[16px] gap-[12px]">
      {/* Header block */}
      <LoadingSkeleton width="70%" height={22} borderRadius={6} />
      <LoadingSkeleton width="50%" height={16} borderRadius={6} />

      {/* Stats bar */}
      <View className="flex-row gap-[12px] mt-[8px]">
        {[1, 2, 3, 4].map((i) => (
          <LoadingSkeleton key={i} width={60} height={40} borderRadius={8} />
        ))}
      </View>

      {/* Player chips */}
      <View className="flex-row gap-[8px] mt-[8px]">
        {[1, 2, 3, 4].map((i) => (
          <LoadingSkeleton key={i} width={44} height={44} borderRadius={22} />
        ))}
      </View>

      {/* Game cards */}
      {[1, 2, 3].map((i) => (
        <LoadingSkeleton key={i} width="100%" height={72} borderRadius={12} />
      ))}
    </View>
  );
}
