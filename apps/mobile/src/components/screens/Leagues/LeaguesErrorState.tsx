/**
 * Error state for the Leagues tab — shown when data fetching fails.
 */

import React from 'react';
import EmptyState from '@/components/ui/EmptyState';

interface LeaguesErrorStateProps {
  readonly onRetry: () => void;
}

export default function LeaguesErrorState({
  onRetry,
}: LeaguesErrorStateProps): React.ReactNode {
  return <EmptyState testID="leagues-error-state" title="Could not load leagues"
    description="Check your connection and try again."
    primaryAction={{ label: 'Try Again', onPress: onRetry, testID: 'retry-btn' }} />;
}
