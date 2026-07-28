/**
 * StatsGrid — 2×3 grid of stat cards.
 *
 * Matches `.stats-grid` / `.stat-card` in my-stats.html.
 * Shows: Win Rate, Current Streak, Avg Point Diff, Peak Rating,
 *        Games Played, W-L record.
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { MyStatsOverall } from '@beach-kings/shared';
import { formatWinRate } from '@/lib/formatters';

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly trend?: string | null;
  readonly trendUp?: boolean;
}

function StatCard({ label, value, trend, trendUp }: StatCardProps): React.ReactNode {
  return (
    <View className="flex-1 bg-surface rounded-[12px] p-[14px] shadow-sm dark:shadow-none dark:border border-divider">
      <Text className="text-[11px] text-muted uppercase tracking-wider">
        {label}
      </Text>
      <Text className="text-[22px] font-bold text-default mt-1">
        {value}
      </Text>
      {trend != null && (
        <Text
          className={`text-[11px] font-bold mt-[3px] ${
            trendUp
              ? 'text-success'
              : 'text-danger'
          }`}
        >
          {trend}
        </Text>
      )}
    </View>
  );
}

interface StatsGridProps {
  readonly stats: MyStatsOverall;
}

export default function StatsGrid({ stats }: StatsGridProps): React.ReactNode {
  const streakLabel = stats.current_streak >= 0
    ? `${stats.current_streak}W Streak`
    : `${Math.abs(stats.current_streak)}L Streak`;
  const streakUp = stats.current_streak >= 0;
  const streakTrend = stats.current_streak !== 0 ? streakLabel : null;

  const avgDiffTrend =
    stats.avg_point_diff !== 0
      ? `${stats.avg_point_diff >= 0 ? '+' : ''}${stats.avg_point_diff.toFixed(1)} avg`
      : null;

  return (
    <View testID="stats-grid" className="gap-3">
      {/* Row 1 */}
      <View className="flex-row gap-3">
        <StatCard
          label="Win Rate"
          value={formatWinRate(stats.wins, stats.losses)}
          trend={streakTrend}
          trendUp={streakUp}
        />
        <StatCard
          label="Avg Pt Diff"
          value={`${stats.avg_point_diff >= 0 ? '+' : ''}${stats.avg_point_diff.toFixed(1)}`}
          trend={avgDiffTrend}
          trendUp={stats.avg_point_diff >= 0}
        />
      </View>

      {/* Row 2 */}
      <View className="flex-row gap-3">
        <StatCard
          label="Peak Rating"
          value={String(stats.peak_rating)}
        />
        <StatCard
          label="Record"
          value={`${stats.wins}-${stats.losses}`}
        />
      </View>

      {/* Row 3 */}
      <View className="flex-row gap-3">
        <StatCard
          label="Games Played"
          value={String(stats.games_played)}
        />
        <StatCard
          label="Rating"
          value={String(stats.rating)}
        />
      </View>
    </View>
  );
}
