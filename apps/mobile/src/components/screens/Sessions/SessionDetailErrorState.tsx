/**
 * SessionDetailErrorState — shown when session detail fetch fails.
 */

import React from 'react';
import EmptyState from '@/components/ui/EmptyState';

interface Props {
  readonly onRetry: () => void;
}

export default function SessionDetailErrorState({ onRetry }: Props): React.ReactNode {
  return <EmptyState testID="session-detail-error" title="Could not load session"
    description="Check your connection and try again."
    primaryAction={{ label: 'Retry', onPress: onRetry, testID: 'session-detail-retry-btn' }} />;
}
