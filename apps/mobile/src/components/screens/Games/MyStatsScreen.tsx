/**
 * MyStatsScreen — orchestrator for the My Stats screen.
 *
 * Layout (matches my-stats.html):
 *   - compact profile header (avatar, name, city, level badge)
 *   - stats bar (Games | Rating | W-L | Win Rate)
 *   - trophy row (horizontal scroll)
 *   - time chips (30d / 90d / 1y / All Time)
 *   - stats grid (2x3 stat cards)
 *   - rating history chart
 *   - partners / opponents breakdown table
 *
 * Wireframe ref: my-stats.html
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import { formatElo, formatWinRate } from '@/lib/formatters';
import { useMyStatsScreen, type TimeFilter } from './useMyStatsScreen';
import StatsSkeleton from './StatsSkeleton';
import StatsErrorState from './StatsErrorState';
import TrophyRow from './TrophyRow';
import StatsGrid from './StatsGrid';
import RatingChart from './RatingChart';
import BreakdownTable from './BreakdownTable';
import Avatar from '@/components/ui/Avatar';
import FilterChipBar from '@/components/ui/FilterChipBar';

// ---------------------------------------------------------------------------
// Profile header
// ---------------------------------------------------------------------------

interface ProfileHeaderProps {
  readonly name: string;
  readonly city: string | null;
  readonly level: string | null;
  readonly avatarUrl: string | null;
}

function ProfileHeader({
  name,
  city,
  level,
  avatarUrl,
}: ProfileHeaderProps): React.ReactNode {
  return (
    <View className="flex-row items-center gap-[14px] px-4 py-4 bg-surface">
      <Avatar
        imageUrl={avatarUrl}
        name={name}
        size="lg"
        colorSeed={name}
        className="border-[2.5px] border-divider"
        accessible={false}
      />

      <View className="flex-1">
        <AppText className="text-[18px] font-bold text-default">
          {name}
        </AppText>
        <View className="flex-row items-center gap-[6px] mt-[2px]">
          {city != null && (
            <AppText className="text-[12px] text-muted">
              {city}
            </AppText>
          )}
          {level != null && (
            <View className="px-2 py-[2px] rounded-[10px] bg-info-tint">
              <AppText className="text-[11px] font-bold text-brand-teal">
                {level}
              </AppText>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

interface StatsBarItemProps {
  readonly value: string;
  readonly label: string;
}

function StatsBarItem({ value, label }: StatsBarItemProps): React.ReactNode {
  return (
    <View className="flex-1 items-center py-[10px] px-1">
      <AppText className="text-[18px] font-bold text-default">
        {value}
      </AppText>
      <AppText className="text-[10px] text-muted uppercase tracking-wide mt-[2px]">
        {label}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Time chips
// ---------------------------------------------------------------------------

const TIME_OPTIONS: { label: string; value: TimeFilter }[] = [
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: '1y', value: '1y' },
  { label: 'All Time', value: 'all' },
];

interface TimeChipsProps {
  readonly active: TimeFilter;
  readonly onSelect: (t: TimeFilter) => void;
}

function TimeChips({ active, onSelect }: TimeChipsProps): React.ReactNode {
  return (
    <FilterChipBar
      items={TIME_OPTIONS}
      value={active}
      onValueChange={onSelect}
      accessibilityLabel="Stats time range"
      chipTestIDPrefix="time-chip"
      contentClassName="px-0"
    />
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function MyStatsScreen(): React.ReactNode {
  const {
    stats,
    isLoading,
    error,
    isRefreshing,
    timeFilter,
    breakdownTab,
    setTimeFilter,
    setBreakdownTab,
    onRefresh,
    onRetry,
  } = useMyStatsScreen();

  // --- Loading skeleton ---
  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="my-stats-screen"
      >
        <TopNav title="My Stats" showBack />
        <StatsSkeleton />
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (error != null && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="my-stats-screen"
      >
        <TopNav title="My Stats" showBack />
        <StatsErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  // --- No data yet ---
  if (stats == null) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="my-stats-screen"
      >
        <TopNav title="My Stats" showBack />
        <StatsSkeleton />
      </SafeAreaView>
    );
  }

  const { overall } = stats;

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="my-stats-screen"
    >
      <TopNav title="My Stats" showBack />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {/* Profile header */}
        <ProfileHeader
          name={stats.player_name}
          city={stats.player_city}
          level={stats.player_level}
          avatarUrl={stats.player_avatar_url ?? null}
        />

        {/* Stats bar */}
        <View className="flex-row bg-surface border-t border-b border-divider">
          <StatsBarItem value={String(overall.games_played)} label="Games" />
          <View className="w-px bg-divider" />
          <StatsBarItem value={formatElo(overall.rating)} label="Rating" />
          <View className="w-px bg-divider" />
          <StatsBarItem value={`${overall.wins}-${overall.losses}`} label="W-L" />
          <View className="w-px bg-divider" />
          <StatsBarItem
            value={formatWinRate(overall.wins, overall.losses)}
            label="Win Rate"
          />
        </View>

        {/* Content */}
        <View className="px-4 pt-4">
          {/* Trophies */}
          {stats.trophies.length > 0 && (
            <View className="mb-4">
              <AppText className="text-[15px] font-bold text-default mb-[10px]">
                Trophies
              </AppText>
              <TrophyRow trophies={stats.trophies} />
            </View>
          )}

          {/* Overview section */}
          <AppText className="text-[15px] font-bold text-default mb-[10px]">
            Overview
          </AppText>

          {/* Time chips */}
          <View className="mb-[12px]">
            <TimeChips active={timeFilter} onSelect={setTimeFilter} />
          </View>

          {/* Stats grid */}
          <View className="mb-4">
            <StatsGrid stats={overall} />
          </View>

          {/* Rating history chart */}
          <RatingChart timeline={stats.elo_timeline} />

          {/* Partners / Opponents breakdown */}
          <AppText className="text-[15px] font-bold text-default mb-[10px]">
            Breakdown
          </AppText>
          <BreakdownTable
            tab={breakdownTab}
            partners={stats.partners}
            opponents={stats.opponents}
            onTabChange={setBreakdownTab}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
