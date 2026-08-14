/**
 * Full-width league card for the Leagues tab.
 * Mirrors `.league-card` in leagues-tab.html wireframe.
 *
 * Shows: name, location, active-season badge, games/W-L/win-rate stats,
 * rank badge, member count, and chevron affordance.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import type { League } from '@beach-kings/shared';
import { TrophyIcon, ChevronRightIcon } from '@/components/ui/icons';
import { formatRecord, formatWinRate, formatOrdinal, pluralize } from '@/lib/formatters';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
      <AppText className="text-[16px] font-bold text-default">
        {value}
      </AppText>
      <AppText className="text-[11px] text-tertiary uppercase tracking-wide mt-[2px]">
        {label}
      </AppText>
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
  const palette = usePaletteColors();
  const memberCount = league.member_count ?? 0;
  const gamesPlayed = league.games_played ?? userWins + userLosses;
  const leagueGamesPlayed = league.league_games_played ?? 0;
  // The card's stats are scoped to the league's *current* season (see backend
  // get_user_leagues). An established member can have zero activity in a brand-
  // new active season, so guard against showing a misleading 0 / 0-0 / 0%.
  const hasSeasonActivity = gamesPlayed > 0;
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
      className="bg-surface rounded-card p-md mb-sm border border-divider active:opacity-80"
    >
      {/* Top row */}
      <View className="flex-row items-start mb-sm">
        <View className="w-11 h-11 rounded-[12px] bg-info-tint items-center justify-center flex-shrink-0">
          <TrophyIcon size={20} color={palette.brandTeal} />
        </View>

        <View className="flex-1 ml-md">
          <AppText
            className="text-callout font-bold text-default"
            numberOfLines={2}
          >
            {league.name}
          </AppText>
          {locationDisplay != null && (
            <AppText className="text-[12px] text-tertiary mt-[2px]">
              {locationDisplay}
            </AppText>
          )}
        </View>

        {isActive && (
          <View className="bg-success-tint rounded-[10px] px-sm py-[2px] ml-sm">
            <AppText className="text-[11px] font-semibold text-success">
              Active
            </AppText>
          </View>
        )}
      </View>

      {/* Stats row — current-season scoped */}
      {hasSeasonActivity ? (
        <>
          <AppText className="text-[11px] text-tertiary uppercase tracking-wide mt-xs mb-xs">
            This Season
          </AppText>
          <View className="flex-row gap-lg">
            <StatBlock value={String(gamesPlayed)} label="Games" />
            <StatBlock value={formatRecord(userWins, userLosses)} label="W-L" />
            <StatBlock
              value={formatWinRate(userWins, userLosses)}
              label="Win Rate"
            />
          </View>
        </>
      ) : (
        <View
          testID={`league-card-${league.id}-no-season-activity`}
          className="mt-xs mb-xs"
        >
          {/* User-scoped copy: games_played counts the VIEWER's games in the
              current season (backend get_user_leagues) — the league itself may
              have plenty of activity from other players (QA S3). */}
          <AppText className="text-[13px] text-muted">
            You haven&apos;t played this season yet
          </AppText>
          {leagueGamesPlayed > 0 && (
            <AppText className="text-[12px] text-tertiary mt-[2px]">
              League has {pluralize(leagueGamesPlayed, 'game')} this season
            </AppText>
          )}
          <AppText className="text-[12px] font-medium text-brand-teal mt-[2px]">
            View league history ›
          </AppText>
        </View>
      )}

      {/* Rank bar */}
      <View className="flex-row items-center justify-between mt-md pt-md border-t border-divider">
        {userRank != null ? (
          <View className="bg-info-tint rounded-[10px] px-sm py-[4px]">
            <AppText className="text-[12px] font-semibold text-info">
              {formatOrdinal(userRank)} Ranked
            </AppText>
          </View>
        ) : (
          <View />
        )}

        <AppText className="text-[12px] text-tertiary">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </AppText>

        <ChevronRightIcon size={18} color={palette.textTertiary} />
      </View>
    </Pressable>
  );
}
