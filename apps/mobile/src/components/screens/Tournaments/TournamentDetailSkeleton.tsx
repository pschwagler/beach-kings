/**
 * TournamentDetailSkeleton — placeholder shimmer for tournament detail.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function TournamentDetailSkeleton(): React.ReactNode {
  return (
    <View testID="tournament-detail-loading" className="px-[16px] pt-[16px] gap-[12px]">
      <LoadingSkeleton width="75%" height={24} borderRadius={6} />
      <LoadingSkeleton width="50%" height={16} borderRadius={6} />
      <View className="flex-row gap-[8px] mt-[4px]">
        <LoadingSkeleton width={80} height={26} borderRadius={13} />
        <LoadingSkeleton width={70} height={26} borderRadius={13} />
        <LoadingSkeleton width={60} height={26} borderRadius={13} />
      </View>
      <LoadingSkeleton width="100%" height={48} borderRadius={12} />
      <LoadingSkeleton width="100%" height={120} borderRadius={12} />
      <LoadingSkeleton width="100%" height={80} borderRadius={12} />
    </View>
  );
}
