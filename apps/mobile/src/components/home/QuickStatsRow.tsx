/**
 * Quick stats pill row shown under the HomeHeader.
 * Greeting + rating pill + win/loss pill — mirrors `home.html` `.quick-stats`.
 */

import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import AppText from '@/components/ui/AppText';
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
  const { fontScale } = useWindowDimensions();
  const usesAccessibilityLayout = fontScale >= 1.6;

  return (
    <View
      className={`${usesAccessibilityLayout ? 'items-start' : 'flex-row items-center'} gap-3 px-lg py-sm bg-surface border-b border-divider`}
    >
      <AppText className={`${usesAccessibilityLayout ? '' : 'flex-1'} text-subhead font-semibold text-default`}>
        Hey {firstName}
      </AppText>
      <View className="flex-row flex-wrap items-center gap-3">
        {rating != null && (
          <View className="bg-info-tint px-sm py-xxs rounded-chip">
            <AppText className="text-caption font-semibold text-info">
              <AppText className="font-bold">{formatElo(rating)}</AppText> Rating
            </AppText>
          </View>
        )}
        <View className="bg-info-tint px-sm py-xxs rounded-chip">
          <AppText className="text-caption font-semibold text-info">
            <AppText className="font-bold">{formatRecord(wins, losses)}</AppText>
          </AppText>
        </View>
      </View>
    </View>
  );
}
