/**
 * Error state for the KoB screen when tournament data fetching fails.
 */

import React, { useCallback } from 'react';
import { hapticMedium } from '@/utils/haptics';
import EmptyState from '@/components/ui/EmptyState';

interface KobErrorStateProps {
  readonly onRetry: () => void;
}

export default function KobErrorState({
  onRetry,
}: KobErrorStateProps): React.ReactNode {
  const handleRetry = useCallback(() => {
    void hapticMedium();
    onRetry();
  }, [onRetry]);

  return <EmptyState testID="kob-error-state" title="Could Not Load Tournament"
    description="Something went wrong while loading tournament data. Check your connection and try again."
    primaryAction={{ label: 'Try Again', onPress: handleRetry, testID: 'kob-retry-btn' }} />;
}
