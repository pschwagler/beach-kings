/**
 * StatsBar — horizontal row of 4 key stats (Games, Rating, W-L, Win Rate).
 * Matches the stats-bar section in profile.html wireframe.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View } from 'react-native';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { formatElo, formatWinRate } from '@/lib/formatters';

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
      className={`flex-1 items-center py-md ${isLast ? '' : 'border-r border-divider'}`}
    >
      <AppText
        className={`text-lg font-bold ${
          muted ? 'text-muted' : 'text-default'
        }`}
      >
        {value}
      </AppText>
      <AppText className="text-2xs uppercase tracking-wide text-muted mt-0.5">
        {label}
      </AppText>
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
      <View className="flex-row bg-surface border-t border-divider border-b">
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
  const winRate = formatWinRate(wins, losses);

  return (
    <View className="flex-row bg-surface border-t border-divider border-b">
      <StatCell
        value={games != null ? String(games) : '0'}
        label="Games"
        muted={hasNoData}
      />
      <StatCell
        value={rating != null ? formatElo(rating) : '--'}
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
