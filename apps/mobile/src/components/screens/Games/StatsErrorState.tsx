/**
 * Error state for My Stats when data fetching fails.
 */

import React, { useCallback } from 'react';
import { hapticMedium } from '@/utils/haptics';
import EmptyState from '@/components/ui/EmptyState';

interface StatsErrorStateProps {
  readonly onRetry: () => void;
}

export default function StatsErrorState({
  onRetry,
}: StatsErrorStateProps): React.ReactNode {
  const handleRetry = useCallback(() => {
    void hapticMedium();
    onRetry();
  }, [onRetry]);

  return <EmptyState testID="stats-error-state" title="Could Not Load Stats"
    description="Something went wrong while fetching your stats. Check your connection and try again."
    primaryAction={{ label: 'Try Again', onPress: handleRetry, testID: 'stats-retry-btn' }} />;
}
