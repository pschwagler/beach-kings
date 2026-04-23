/**
 * TournamentListSkeleton — placeholder shimmer shown while tournaments load.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function TournamentListSkeleton(): React.ReactNode {
  return (
    <View testID="tournaments-loading" className="px-[16px] pt-[16px] gap-[12px]">
      <LoadingSkeleton width="50%" height={20} borderRadius={6} />
      <LoadingSkeleton width="100%" height={90} borderRadius={12} />
      <LoadingSkeleton width="50%" height={20} borderRadius={6} />
      {[1, 2, 3].map((i) => (
        <LoadingSkeleton key={i} width="100%" height={70} borderRadius={12} />
      ))}
    </View>
  );
}
