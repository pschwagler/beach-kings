/**
 * StatCard component — displays a stat value with a label and optional trend indicator.
 * Trend: up = green arrow, down = red arrow, neutral = gray dash.
 */

import React from 'react';
import { View, Text } from 'react-native';

type Trend = 'up' | 'down' | 'neutral';

interface StatCardProps {
  readonly value: string | number;
  readonly label: string;
  readonly trend?: Trend;
  readonly className?: string;
}

const trendConfig: Record<Trend, { symbol: string; color: string }> = {
  up: { symbol: '\u2191', color: 'text-success dark:text-success-text' },
  down: { symbol: '\u2193', color: 'text-danger dark:text-danger-text' },
  neutral: { symbol: '\u2014', color: 'text-text-muted dark:text-text-tertiary' },
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
      className={`bg-white dark:bg-dark-surface rounded-card p-lg shadow-sm dark:shadow-none dark:border dark:border-border-subtle items-center ${className}`}
    >
      <View className="flex-row items-center gap-xs">
        <Text className="text-3xl font-bold text-text-default dark:text-content-primary">
          {value}
        </Text>
        {trendInfo != null && (
          <Text className={`text-lg font-semibold ${trendInfo.color}`}>
            {trendInfo.symbol}
          </Text>
        )}
      </View>
      <Text className="text-caption text-text-muted dark:text-text-tertiary mt-xs text-center">
        {label}
      </Text>
    </View>
  );
}
