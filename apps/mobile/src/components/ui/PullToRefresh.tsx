/**
 * PullToRefresh — ScrollView wrapper with teal RefreshControl.
 * Wraps children in a scrollable container that supports pull-to-refresh.
 */

import React from 'react';
import { ScrollView, RefreshControl } from 'react-native';

interface PullToRefreshProps {
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly children: React.ReactNode;
  readonly className?: string;
}

const TEAL_COLOR = '#0D9488';

export default function PullToRefresh({
  refreshing,
  onRefresh,
  children,
  className = '',
}: PullToRefreshProps): React.ReactNode {
  return (
    <ScrollView
      className={`flex-1 ${className}`}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={TEAL_COLOR}
          colors={[TEAL_COLOR]}
        />
      }
    >
      {children}
    </ScrollView>
  );
}
