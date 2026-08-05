/**
 * PullToRefresh — ScrollView wrapper with teal RefreshControl.
 * Wraps children in a scrollable container that supports pull-to-refresh.
 */

import React from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface PullToRefreshProps {
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export default function PullToRefresh({
  refreshing,
  onRefresh,
  children,
  className = '',
}: PullToRefreshProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <ScrollView
      className={`flex-1 ${className}`}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.brandTeal}
          colors={[palette.brandTeal]}
        />
      }
    >
      {children}
    </ScrollView>
  );
}
