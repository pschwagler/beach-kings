/**
 * Quick stats pill row shown under the HomeHeader.
 * Greeting + rating pill + win/loss pill — mirrors `home.html` `.quick-stats`.
 */

import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { formatElo, formatRecord } from '@/lib/formatters';

const statButtonClass = 'min-h-touch min-w-touch items-center justify-center rounded-chip bg-info-tint px-sm py-xxs active:opacity-70 focus:opacity-70';

interface QuickStatsRowProps {
  readonly firstName: string;
  readonly rating: number | null;
  readonly wins: number;
  readonly losses: number;
  readonly onStatsPress: () => void;
}

export default function QuickStatsRow({
  firstName,
  rating,
  wins,
  losses,
  onStatsPress,
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rating ${formatElo(rating)}`}
            accessibilityHint="Opens My Stats"
            className={statButtonClass}
            onPress={onStatsPress}
          >
            <AppText className="text-caption font-semibold text-info">
              <AppText className="font-bold text-info">{formatElo(rating)}</AppText> Rating
            </AppText>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Record, ${wins} wins, ${losses} losses`}
          accessibilityHint="Opens My Stats"
          className={statButtonClass}
          onPress={onStatsPress}
        >
          <AppText className="text-caption font-semibold text-info">
            <AppText className="font-bold text-info">{formatRecord(wins, losses)}</AppText>
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
