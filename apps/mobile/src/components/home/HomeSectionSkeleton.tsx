/** Bounded loading placeholder for one progressively rendered Home section. */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

interface HomeSectionSkeletonProps {
  readonly label: string;
  readonly wide?: boolean;
}

export default function HomeSectionSkeleton({
  label,
  wide = false,
}: HomeSectionSkeletonProps): React.ReactNode {
  return (
    <View
      className={wide ? 'mb-lg' : 'flex-row gap-sm'}
      accessibilityLabel={`Loading ${label}`}
    >
      <LoadingSkeleton
        width={wide ? '100%' : 200}
        height={wide ? 148 : 120}
        borderRadius={12}
      />
      {!wide ? (
        <LoadingSkeleton width={200} height={120} borderRadius={12} />
      ) : null}
    </View>
  );
}
