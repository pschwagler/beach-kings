/**
 * Stats grid section for the Player Profile screen.
 * Matches wireframe: hero win-rate card + W-L, Games, ELO, Avg Pt Diff cards.
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { Player } from '@beach-kings/shared';

interface PlayerStatsGridProps {
  readonly player: Player;
}

interface StatCardProps {
  readonly value: string;
  readonly label: string;
  readonly hero?: boolean;
  readonly secondary?: boolean;
  readonly testID?: string;
}

function StatCard({ value, label, hero = false, secondary = false, testID }: StatCardProps): React.ReactNode {
  return (
    <View
      testID={testID}
      className={`rounded-xl p-md items-center ${
        hero
          ? 'bg-brand-teal/10 dark:bg-brand-teal/20 col-span-2 py-lg'
          : secondary
          ? 'bg-bg-card dark:bg-elevated-2'
          : 'bg-bg-card dark:bg-elevated-2'
      }`}
      style={hero ? { flex: 1 } : { width: '48%' }}
    >
      <Text
        className={`font-bold text-navy dark:text-content-primary ${
          hero ? 'text-[28px]' : secondary ? 'text-base text-text-muted dark:text-text-tertiary' : 'text-[22px]'
        }`}
      >
        {value}
      </Text>
      <Text
        className={`text-[11px] uppercase tracking-wider mt-[3px] ${
          secondary ? 'text-text-disabled dark:text-text-disabled' : 'text-text-muted dark:text-text-tertiary'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function PlayerStatsGrid({ player }: PlayerStatsGridProps): React.ReactNode {
  const wins = player.wins ?? 0;
  const losses = player.losses ?? 0;
  const games = player.total_games ?? wins + losses;
  const rating = player.current_rating ?? null;

  const winRate =
    games > 0 ? Math.round((wins / games) * 100) : 0;

  return (
    <View
      testID="player-stats-grid"
      className="bg-white dark:bg-elevated px-lg pt-md pb-lg mt-sm"
    >
      <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-md">
        Stats
      </Text>

      {/* Hero win rate card */}
      <View className="flex-row mb-sm">
        <StatCard
          value={`${winRate}%`}
          label="Win Rate"
          hero
          testID="stat-win-rate"
        />
      </View>

      {/* 2-column grid */}
      <View className="flex-row flex-wrap gap-sm">
        <StatCard
          value={`${wins}-${losses}`}
          label="W-L Record"
          testID="stat-record"
        />
        <StatCard
          value={String(games)}
          label="Games"
          testID="stat-games"
        />
        {rating != null && (
          <StatCard
            value={String(Math.round(rating))}
            label="ELO Rating"
            secondary
            testID="stat-rating"
          />
        )}
      </View>
    </View>
  );
}
