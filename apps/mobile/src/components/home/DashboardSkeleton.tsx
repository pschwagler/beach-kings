/**
 * Shimmer placeholder shown while the Home dashboard loads.
 * Only renders the section skeletons — the HomeHeader renders independently
 * so the brand nav is visible immediately.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

function SectionSkeleton({ title }: { readonly title: string }): React.ReactNode {
  return (
    <View className="mb-lg" accessibilityLabel={`Loading ${title}`}>
      <View className="flex-row justify-between items-center mb-sm">
        <LoadingSkeleton width={120} height={18} borderRadius={4} />
        <LoadingSkeleton width={60} height={14} borderRadius={4} />
      </View>
      <View className="flex-row gap-sm">
        <LoadingSkeleton width={200} height={120} borderRadius={12} />
        <LoadingSkeleton width={200} height={120} borderRadius={12} />
      </View>
    </View>
  );
}

export default function DashboardSkeleton(): React.ReactNode {
  return (
    <View className="px-lg pt-md pb-xxxl" accessibilityRole="none">
      <View className="mb-lg">
        <LoadingSkeleton width="100%" height={72} borderRadius={12} />
      </View>
      <SectionSkeleton title="Active Sessions" />
      <SectionSkeleton title="Recent Games" />
      <SectionSkeleton title="My Leagues" />
      <SectionSkeleton title="Tournaments" />
      <SectionSkeleton title="Courts Near You" />
    </View>
  );
}
