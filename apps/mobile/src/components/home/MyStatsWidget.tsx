import React from 'react';
import { Pressable, View } from 'react-native';
import type { EloTimelinePoint, MyStatsPayload } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import { formatElo, formatRecord, formatWinRate } from '@/lib/formatters';

export function getRecentRatingChange(
  timeline: readonly EloTimelinePoint[],
): number | null {
  if (timeline.length < 2) return null;
  return timeline[timeline.length - 1]!.rating - timeline[timeline.length - 2]!.rating;
}

function formatChange(change: number | null): string {
  if (change == null) return '--';
  const rounded = Math.round(change);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function Metric({ label, value, detail, valueClassName = 'text-heading' }: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly valueClassName?: string;
}): React.ReactNode {
  return (
    <View className="min-w-[92px] flex-1 py-xs" accessible={false}>
      <AppText className={`font-bold ${valueClassName}`}>{value}</AppText>
      <AppText className="text-sm text-muted">{label}</AppText>
      {detail != null ? <AppText className="text-xs text-muted">{detail}</AppText> : null}
    </View>
  );
}

export default function MyStatsWidget({ stats, onPress }: {
  readonly stats: MyStatsPayload;
  readonly onPress: () => void;
}): React.ReactNode {
  const { overall } = stats;
  const change = getRecentRatingChange(stats.elo_timeline);
  const changeClass = change == null || change === 0
    ? 'text-muted'
    : change > 0 ? 'text-success' : 'text-danger';

  return (
    <Pressable
      testID="home-my-stats-widget"
      accessibilityRole="button"
      accessibilityLabel={`My Stats. Rating ${formatElo(overall.rating)}. Record ${formatRecord(overall.wins, overall.losses)}. Win rate ${formatWinRate(overall.wins, overall.losses)}. Recent rating change ${formatChange(change)}.`}
      accessibilityHint="Opens your complete stats"
      onPress={onPress}
      className="min-h-11 rounded-card border border-divider bg-surface px-lg py-md active:bg-surface-subtle focus:bg-surface-subtle"
    >
      <View className="flex-row flex-wrap gap-sm">
        <Metric label="Rating" value={formatElo(overall.rating)} />
        <Metric
          label="W-L"
          value={formatRecord(overall.wins, overall.losses)}
          detail={`${formatWinRate(overall.wins, overall.losses)} win rate`}
        />
        <Metric
          label="Recent change"
          value={formatChange(change)}
          valueClassName={changeClass}
        />
      </View>
    </Pressable>
  );
}
