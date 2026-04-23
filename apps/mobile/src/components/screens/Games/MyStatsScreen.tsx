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
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import { useMyStatsScreen, type TimeFilter } from './useMyStatsScreen';
import StatsSkeleton from './StatsSkeleton';
import StatsErrorState from './StatsErrorState';
import TrophyRow from './TrophyRow';
import StatsGrid from './StatsGrid';
import RatingChart from './RatingChart';
import BreakdownTable from './BreakdownTable';

// ---------------------------------------------------------------------------
// Profile header
// ---------------------------------------------------------------------------

interface ProfileHeaderProps {
  readonly name: string;
  readonly city: string | null;
  readonly level: string | null;
}

function ProfileHeader({ name, city, level }: ProfileHeaderProps): React.ReactNode {
  return (
    <View className="flex-row items-center gap-[14px] px-4 py-4 bg-white dark:bg-dark-surface">
      {/* Avatar placeholder */}
      <View className="w-14 h-14 rounded-full bg-teal-200 dark:bg-info-bg border-[2.5px] border-teal-100 dark:border-border-subtle items-center justify-center">
        <Text className="text-[20px] font-bold text-accent dark:text-brand-teal">
          {name.slice(0, 1).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="text-[18px] font-bold text-text-default dark:text-content-primary">
          {name}
        </Text>
        <View className="flex-row items-center gap-[6px] mt-[2px]">
          {city != null && (
            <Text className="text-[12px] text-text-muted dark:text-content-tertiary">
              {city}
            </Text>
          )}
          {level != null && (
            <View className="px-2 py-[2px] rounded-[10px] bg-teal-50 dark:bg-info-bg">
              <Text className="text-[11px] font-bold text-accent dark:text-brand-teal">
                {level}
              </Text>
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
      <Text className="text-[18px] font-bold text-navy dark:text-content-primary">
        {value}
      </Text>
      <Text className="text-[10px] text-text-muted dark:text-content-tertiary uppercase tracking-wide mt-[2px]">
        {label}
      </Text>
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
    <View className="flex-row gap-[6px]">
      {TIME_OPTIONS.map(({ label, value }) => (
        <Pressable
          key={value}
          testID={`time-chip-${value}`}
          onPress={() => onSelect(value)}
          accessibilityRole="button"
          accessibilityLabel={label}
          className={`px-[14px] rounded-[16px] min-h-[36px] items-center justify-center border ${
            active === value
              ? 'bg-navy dark:bg-content-primary border-navy dark:border-content-primary'
              : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-border-subtle'
          }`}
        >
          <Text
            className={`text-[12px] font-bold ${
              active === value
                ? 'text-white'
                : 'text-text-muted dark:text-content-secondary'
            }`}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
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
        className="flex-1 bg-bg-page dark:bg-base"
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
        className="flex-1 bg-bg-page dark:bg-base"
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
        className="flex-1 bg-bg-page dark:bg-base"
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
      className="flex-1 bg-bg-page dark:bg-base"
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
        />

        {/* Stats bar */}
        <View className="flex-row bg-white dark:bg-dark-surface border-t border-b border-gray-100 dark:border-border-subtle">
          <StatsBarItem value={String(overall.games_played)} label="Games" />
          <View className="w-px bg-gray-100 dark:bg-border-subtle" />
          <StatsBarItem value={String(overall.rating)} label="Rating" />
          <View className="w-px bg-gray-100 dark:bg-border-subtle" />
          <StatsBarItem value={`${overall.wins}-${overall.losses}`} label="W-L" />
          <View className="w-px bg-gray-100 dark:bg-border-subtle" />
          <StatsBarItem value={`${overall.win_rate.toFixed(0)}%`} label="Win Rate" />
        </View>

        {/* Content */}
        <View className="px-4 pt-4">
          {/* Trophies */}
          {stats.trophies.length > 0 && (
            <View className="mb-4">
              <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px]">
                Trophies
              </Text>
              <TrophyRow trophies={stats.trophies} />
            </View>
          )}

          {/* Overview section */}
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px]">
            Overview
          </Text>

          {/* Time chips */}
          <View className="mb-[12px]">
            <TimeChips active={timeFilter} onSelect={setTimeFilter} />
          </View>

          {/* Stats grid */}
          <View className="mb-4">
            <StatsGrid stats={overall} />
          </View>

          {/* Rating history chart */}
          {stats.elo_timeline.length >= 2 && (
            <RatingChart timeline={stats.elo_timeline} />
          )}

          {/* Partners / Opponents breakdown */}
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px]">
            Breakdown
          </Text>
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
