/**
 * Quick stats pill row shown under the HomeHeader.
 * Greeting + rating pill + win/loss pill — mirrors `home.html` `.quick-stats`.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { formatElo, formatRecord } from '@/lib/formatters';

interface QuickStatsRowProps {
  readonly firstName: string;
  readonly rating: number | null;
  readonly wins: number;
  readonly losses: number;
}

export default function QuickStatsRow({
  firstName,
  rating,
  wins,
  losses,
}: QuickStatsRowProps): React.ReactNode {
  return (
    <View className="flex-row items-center gap-3 px-lg py-sm bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-border-subtle">
      <Text className="flex-1 text-subhead font-semibold text-text-default dark:text-content-primary">
        Hey {firstName}
      </Text>
      {rating != null && (
        <View className="bg-teal-tint dark:bg-info-bg px-sm py-xxs rounded-chip">
          <Text className="text-caption font-semibold text-primary dark:text-info-text">
            <Text className="font-bold">{formatElo(rating)}</Text> Rating
          </Text>
        </View>
      )}
      <View className="bg-teal-tint dark:bg-info-bg px-sm py-xxs rounded-chip">
        <Text className="text-caption font-semibold text-primary dark:text-info-text">
          <Text className="font-bold">{formatRecord(wins, losses)}</Text>
        </Text>
      </View>
    </View>
  );
}
