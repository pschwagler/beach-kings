/**
 * Error state for My Games when data fetching fails.
 * Shows an error message with a retry button.
 */

import React, { useCallback } from 'react';
import { hapticMedium } from '@/utils/haptics';
import EmptyState from '@/components/ui/EmptyState';

interface GamesErrorStateProps {
  readonly onRetry: () => void;
}

export default function GamesErrorState({
  onRetry,
}: GamesErrorStateProps): React.ReactNode {
  const handleRetry = useCallback(() => {
    void hapticMedium();
    onRetry();
  }, [onRetry]);

  return <EmptyState testID="games-error-state" title="Could Not Load Games"
    description="Something went wrong while fetching your game history. Check your connection and try again."
    primaryAction={{ label: 'Try Again', onPress: handleRetry, testID: 'games-retry-btn' }} />;
}
