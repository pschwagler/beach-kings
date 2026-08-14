/**
 * StatCard component — displays a stat value with a label and optional trend indicator.
 * Trend: up = green arrow, down = red arrow, neutral = gray dash.
 */

import React from 'react';
import { View } from 'react-native';
import AppText from './AppText';

type Trend = 'up' | 'down' | 'neutral';

interface StatCardProps {
  readonly value: string | number;
  readonly label: string;
  readonly trend?: Trend;
  readonly className?: string;
}

const trendConfig: Record<Trend, { symbol: string; color: string }> = {
  up: { symbol: '\u2191', color: 'text-success' },
  down: { symbol: '\u2193', color: 'text-danger' },
  neutral: { symbol: '\u2014', color: 'text-muted' },
};

export default function StatCard({
  value,
  label,
  trend,
  className = '',
}: StatCardProps): React.ReactNode {
  const trendInfo = trend != null ? trendConfig[trend] : null;

  return (
    <View
      className={`bg-surface rounded-card border border-divider p-lg items-center ${className}`}
    >
      <View className="flex-row items-center gap-xs">
        <AppText family="display" className="text-3xl font-bold text-default">
          {value}
        </AppText>
        {trendInfo != null && (
          <AppText className={`text-lg font-semibold ${trendInfo.color}`}>
            {trendInfo.symbol}
          </AppText>
        )}
      </View>
      <AppText className="text-caption text-muted mt-xs text-center">
        {label}
      </AppText>
    </View>
  );
}
