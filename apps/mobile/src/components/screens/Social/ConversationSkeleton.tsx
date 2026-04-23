/**
 * ConversationSkeleton — shimmer placeholder rows for the messages list.
 * Matches the `ConversationRow` visual shape.
 */

import React from 'react';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

interface ConversationSkeletonProps {
  readonly count?: number;
}

function SkeletonRow(): React.ReactNode {
  return (
    <View
      testID="conversation-skeleton-row"
      className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-elevated"
    >
      {/* Avatar circle */}
      <LoadingSkeleton width={40} height={40} borderRadius={20} />

      <View className="flex-1 ml-3 gap-2">
        {/* Name + timestamp row */}
        <View className="flex-row items-center justify-between">
          <LoadingSkeleton width="50%" height={14} borderRadius={7} />
          <LoadingSkeleton width={40} height={12} borderRadius={6} />
        </View>
        {/* Preview line */}
        <LoadingSkeleton width="75%" height={12} borderRadius={6} />
      </View>
    </View>
  );
}

export default function ConversationSkeleton({
  count = 6,
}: ConversationSkeletonProps): React.ReactNode {
  return (
    <View testID="conversation-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
