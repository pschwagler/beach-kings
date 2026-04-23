/**
 * Full-width league card for the Leagues tab.
 * Mirrors `.league-card` in leagues-tab.html wireframe.
 *
 * Shows: name, location, active-season badge, games/W-L/win-rate stats,
 * rank badge, member count, and chevron affordance.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { League } from '@beach-kings/shared';
import { TrophyIcon, ChevronRightIcon } from '@/components/ui/icons';
import { formatRecord, formatWinRate, formatOrdinal } from '@/lib/formatters';

interface LeagueCardProps {
  readonly league: League;
  readonly userRank: number | null;
  readonly userWins: number;
  readonly userLosses: number;
  readonly onPress: () => void;
}

function StatBlock({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}): React.ReactNode {
  return (
    <View className="items-center">
      <Text className="text-[16px] font-bold text-navy dark:text-content-primary">
        {value}
      </Text>
      <Text className="text-[11px] text-gray-500 dark:text-content-tertiary uppercase tracking-wide mt-[2px]">
        {label}
      </Text>
    </View>
  );
}

export default function LeagueCard({
  league,
  userRank,
  userWins,
  userLosses,
  onPress,
}: LeagueCardProps): React.ReactNode {
  const memberCount = league.member_count ?? 0;
  const gamesPlayed = league.games_played ?? userWins + userLosses;
  const locationDisplay =
    league.location_name ?? league.region_name ?? null;
  const isActive =
    league.current_season != null &&
    (league.current_season as { is_active?: boolean }).is_active !== false;

  return (
    <Pressable
      testID={`league-card-${league.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${league.name} league`}
      className="bg-white dark:bg-dark-surface rounded-card p-md mb-sm shadow-sm dark:shadow-none dark:border dark:border-border-subtle active:opacity-80"
    >
      {/* Top row */}
      <View className="flex-row items-start mb-sm">
        <View className="w-11 h-11 rounded-[12px] bg-teal-tint dark:bg-info-bg items-center justify-center flex-shrink-0">
          <TrophyIcon size={20} color="#2a7d9c" />
        </View>

        <View className="flex-1 ml-md">
          <Text
            className="text-callout font-bold text-text-default dark:text-content-primary"
            numberOfLines={2}
          >
            {league.name}
          </Text>
          {locationDisplay != null && (
            <Text className="text-[12px] text-gray-500 dark:text-content-tertiary mt-[2px]">
              {locationDisplay}
            </Text>
          )}
        </View>

        {isActive && (
          <View className="bg-green-100 dark:bg-green-900/30 rounded-[10px] px-sm py-[2px] ml-sm">
            <Text className="text-[11px] font-semibold text-green-700 dark:text-green-400">
              Active
            </Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      <View className="flex-row gap-lg mt-xs">
        <StatBlock value={String(gamesPlayed)} label="Games" />
        <StatBlock value={formatRecord(userWins, userLosses)} label="W-L" />
        <StatBlock value={formatWinRate(userWins, userLosses)} label="Win Rate" />
      </View>

      {/* Rank bar */}
      <View className="flex-row items-center justify-between mt-md pt-md border-t border-gray-100 dark:border-border-subtle">
        {userRank != null ? (
          <View className="bg-teal-tint dark:bg-info-bg rounded-[10px] px-sm py-[4px]">
            <Text className="text-[12px] font-semibold text-accent dark:text-info-text">
              {formatOrdinal(userRank)} Ranked
            </Text>
          </View>
        ) : (
          <View />
        )}

        <Text className="text-[12px] text-gray-500 dark:text-content-tertiary">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>

        <ChevronRightIcon size={18} color="#cccccc" />
      </View>
    </Pressable>
  );
}
