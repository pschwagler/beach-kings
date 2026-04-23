/**
 * StatsBar — horizontal row of 4 key stats (Games, Rating, W-L, Win Rate).
 * Matches the stats-bar section in profile.html wireframe.
 */

import React from 'react';
import { View, Text } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

interface StatsBarProps {
  readonly games: number | null;
  readonly rating: number | null;
  readonly wins: number;
  readonly losses: number;
  readonly isLoading: boolean;
}

interface StatCellProps {
  readonly value: string;
  readonly label: string;
  readonly muted: boolean;
  readonly isLast?: boolean;
}

function StatCell({ value, label, muted, isLast = false }: StatCellProps): React.ReactNode {
  return (
    <View
      className={`flex-1 items-center py-md ${isLast ? '' : 'border-r border-border-subtle dark:border-border-subtle'}`}
    >
      <Text
        className={`text-lg font-bold ${
          muted
            ? 'text-text-muted dark:text-text-tertiary'
            : 'text-text-default dark:text-content-primary'
        }`}
      >
        {value}
      </Text>
      <Text className="text-2xs uppercase tracking-wide text-text-muted dark:text-text-tertiary mt-0.5">
        {label}
      </Text>
    </View>
  );
}

export default function StatsBar({
  games,
  rating,
  wins,
  losses,
  isLoading,
}: StatsBarProps): React.ReactNode {
  if (isLoading) {
    return (
      <View className="flex-row bg-white dark:bg-dark-surface border-t border-border-subtle border-b">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="flex-1 items-center py-md px-sm">
            <LoadingSkeleton width={40} height={18} borderRadius={4} />
            <View className="mt-xs">
              <LoadingSkeleton width={30} height={10} borderRadius={3} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  const hasNoData = games === 0 || games == null;
  const winRate =
    wins + losses > 0 ? `${Math.round((wins / (wins + losses)) * 100)}%` : '--';

  return (
    <View className="flex-row bg-white dark:bg-dark-surface border-t border-border-subtle border-b">
      <StatCell
        value={games != null ? String(games) : '0'}
        label="Games"
        muted={hasNoData}
      />
      <StatCell
        value={rating != null ? String(rating) : '--'}
        label="Rating"
        muted={rating == null}
      />
      <StatCell
        value={`${wins}-${losses}`}
        label="W-L"
        muted={hasNoData}
      />
      <StatCell
        value={winRate}
        label="Win Rate"
        muted={winRate === '--'}
        isLast
      />
    </View>
  );
}
