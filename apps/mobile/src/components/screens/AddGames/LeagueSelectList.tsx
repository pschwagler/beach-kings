/**
 * LeagueSelectList — inline league-picker for the "League Game" flow.
 *
 * States:
 *   loading  — shimmer skeletons (2 rows)
 *   error    — error message + retry button
 *   empty    — "You're not in any leagues yet" + Join CTA
 *   data     — scrollable list of league rows
 *
 * Mirrors `add-games-league-select.html` `.league-card` style.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import type { League } from '@beach-kings/shared';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { ChevronRightIcon, TrophyIcon } from '@/components/ui/icons';
import { hapticMedium } from '@/utils/haptics';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LeagueRowSkeleton(): React.ReactNode {
  return (
    <View className="flex-row items-center gap-[14px] bg-white dark:bg-dark-surface rounded-[14px] p-4 mb-[10px]">
      <LoadingSkeleton width={44} height={44} borderRadius={10} />
      <View className="flex-1 gap-[6px]">
        <LoadingSkeleton width="70%" height={15} />
        <LoadingSkeleton width="50%" height={11} />
        <LoadingSkeleton width="40%" height={11} />
      </View>
    </View>
  );
}

interface LeagueRowProps {
  readonly league: League;
  readonly onSelect: (league: League) => void;
}

function LeagueRow({ league, onSelect }: LeagueRowProps): React.ReactNode {
  const handlePress = useCallback(() => {
    void hapticMedium();
    onSelect(league);
  }, [league, onSelect]);

  const activeSeasonName = league.current_season?.name ?? null;
  const location = league.location_name ?? league.region_name ?? null;

  return (
    <Pressable
      testID={`league-row-${league.id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${league.name}`}
      className="flex-row items-center gap-[14px] bg-white dark:bg-dark-surface rounded-[14px] p-4 mb-[10px] shadow-sm dark:shadow-none dark:border dark:border-border-subtle active:border active:border-accent"
    >
      {/* Icon */}
      <View className="w-11 h-11 rounded-[10px] bg-teal-50 dark:bg-info-bg items-center justify-center">
        <TrophyIcon size={22} color="#2a7d9c" />
      </View>

      {/* Info */}
      <View className="flex-1">
        <Text
          className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[2px]"
          numberOfLines={1}
        >
          {league.name}
        </Text>
        {location != null && (
          <Text className="text-[12px] text-text-muted dark:text-content-tertiary">
            {location}
          </Text>
        )}
        {activeSeasonName != null && (
          <Text className="text-[11px] font-semibold text-accent dark:text-brand-teal mt-[3px]">
            {activeSeasonName} - Active
          </Text>
        )}
      </View>

      <ChevronRightIcon size={20} color="#cccccc" />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LeagueSelectListProps {
  readonly leagues: readonly League[] | undefined;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: Error | null;
  readonly onSelect: (league: League) => void;
  readonly onRetry: () => void;
  readonly onRefresh: () => void;
  readonly onJoinLeague: () => void;
}

export default function LeagueSelectList({
  leagues,
  isLoading,
  isRefreshing,
  error,
  onSelect,
  onRetry,
  onRefresh,
  onJoinLeague,
}: LeagueSelectListProps): React.ReactNode {
  if (isLoading) {
    return (
      <View testID="league-list-loading">
        <LeagueRowSkeleton />
        <LeagueRowSkeleton />
      </View>
    );
  }

  if (error != null) {
    return (
      <View
        testID="league-list-error"
        className="items-center py-xl px-lg"
      >
        <Text className="text-body text-text-muted dark:text-content-tertiary mb-md text-center">
          Could not load your leagues. Please try again.
        </Text>
        <Pressable
          testID="league-list-retry"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          className="px-lg py-sm bg-primary dark:bg-brand-teal rounded-lg"
        >
          <Text className="text-white font-semibold text-body">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const hasLeagues = (leagues?.length ?? 0) > 0;

  if (!hasLeagues) {
    return (
      <View
        testID="league-list-empty"
        className="items-center py-xl px-lg"
      >
        <Text className="text-body font-bold text-text-default dark:text-content-primary mb-sm text-center">
          No leagues yet
        </Text>
        <Text className="text-body text-text-muted dark:text-content-tertiary mb-xl text-center">
          You&apos;re not in any leagues yet. Join one to start recording games.
        </Text>
        <Pressable
          testID="league-list-join-cta"
          onPress={onJoinLeague}
          accessibilityRole="button"
          accessibilityLabel="Find leagues"
          className="px-lg py-sm bg-primary dark:bg-brand-teal rounded-lg"
        >
          <Text className="text-white font-semibold text-body">Find Leagues</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      testID="league-list"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      <Text className="text-[12px] font-semibold text-text-muted dark:text-content-tertiary uppercase tracking-wide mb-[10px]">
        Your Leagues
      </Text>
      {leagues!.map((league) => (
        <LeagueRow key={league.id} league={league} onSelect={onSelect} />
      ))}
    </ScrollView>
  );
}
