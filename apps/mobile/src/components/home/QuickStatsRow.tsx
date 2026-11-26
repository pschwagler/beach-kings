import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { ChevronRightIcon } from '@/components/ui/icons';
import { formatElo, formatRecord } from '@/lib/formatters';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface QuickStatLinkProps {
  readonly label: string;
  readonly value: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
}

function QuickStatLink({
  label,
  value,
  accessibilityLabel,
  onPress,
}: QuickStatLinkProps): React.ReactNode {
  const palette = usePaletteColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens My Stats"
      className="max-w-full min-h-touch min-w-touch flex-row items-center gap-1 rounded-md px-sm py-xxs active:bg-elevated focus:bg-elevated"
      onPress={onPress}
    >
      <View className="shrink">
        <AppText className="text-callout font-bold text-default" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </AppText>
        <AppText className="text-caption font-medium text-brand-teal">{label}</AppText>
      </View>
      <ChevronRightIcon size={14} color={palette.brandTeal} />
    </Pressable>
  );
}

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
  const ratingValue = rating == null ? null : formatElo(rating);
  const winsLabel = wins === 1 ? 'win' : 'wins';
  const lossesLabel = losses === 1 ? 'loss' : 'losses';

  return (
    <View
      className={`${usesAccessibilityLayout ? 'items-start' : 'flex-row items-center'} gap-2 px-lg py-xs bg-surface border-b border-divider`}
    >
      <AppText className={`${usesAccessibilityLayout ? '' : 'flex-1'} text-subhead font-semibold text-default`}>
        Hey {firstName}
      </AppText>
      <View className="max-w-full shrink flex-row flex-wrap items-center gap-1">
        {ratingValue != null && (
          <QuickStatLink
            label="Rating"
            value={ratingValue}
            accessibilityLabel={`Rating ${ratingValue}`}
            onPress={onStatsPress}
          />
        )}
        <QuickStatLink
          label="Record"
          value={formatRecord(wins, losses)}
          accessibilityLabel={`Record, ${wins} ${winsLabel}, ${losses} ${lossesLabel}`}
          onPress={onStatsPress}
        />
      </View>
    </View>
  );
}
