/**
 * LeagueSelectList — inline league-picker for the "League Game" flow.
 *
 * States:
 *   loading  — shimmer skeletons (2 rows)
 *   error    — error message + retry button
 *   empty    — "You're not in any leagues yet" + Join CTA
 *   data     — scrollable list of league cards with action buttons
 *
 * Each league card shows: header (icon + name + location + season). Sessions
 * are only surfaced when one is active: a league with an active session gets
 * the "Active Session" badge + a "Continue (N games)" button; a league with
 * none just gets a plain "Add Game" button (no session wording at all).
 *
 * Mirrors `add-games-league-select.html` `.league-card` style.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import type { League, Session } from '@beach-kings/shared';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { TrophyIcon } from '@/components/ui/icons';
import { pluralize } from '@/lib/formatters';
import { hapticMedium } from '@/utils/haptics';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LeagueRowSkeleton(): React.ReactNode {
  return (
    <View className="flex-row items-center gap-[14px] bg-surface rounded-[14px] p-4 mb-[10px]">
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
  readonly league: League & { readonly activeSession?: Session | null };
  readonly onContinue: (session: Session) => void;
  readonly onStartNew: (league: League) => void;
}

function LeagueRow({ league, onContinue, onStartNew }: LeagueRowProps): React.ReactNode {
  const handleContinue = useCallback(() => {
    if (league.activeSession != null) {
      void hapticMedium();
      onContinue(league.activeSession);
    }
  }, [league, onContinue]);

  const handleStartNew = useCallback(() => {
    void hapticMedium();
    onStartNew(league);
  }, [league, onStartNew]);

  const activeSeasonName = league.current_season?.name ?? null;
  const location = league.location_name ?? league.region_name ?? null;
  const hasActiveSession = league.activeSession != null;
  const matchCount = league.activeSession?.match_count ?? 0;

  return (
    <View
      testID={`league-card-${league.id}`}
      className="bg-surface rounded-[14px] p-4 mb-[10px] shadow-sm dark:shadow-none dark:border border-divider"
    >
      {/* Card header: icon + name + location + season */}
      <View className="flex-row items-center gap-[14px] mb-[14px]">
        {/* Icon */}
        <View className="w-11 h-11 rounded-[10px] bg-info-tint items-center justify-center flex-shrink-0">
          <TrophyIcon size={22} color="#2a7d9c" />
        </View>

        {/* Info */}
        <View className="flex-1">
          <Text
            className="text-[15px] font-bold text-default mb-[2px]"
            numberOfLines={1}
          >
            {league.name}
          </Text>
          {location != null && (
            <Text className="text-[12px] text-muted">
              {location}
            </Text>
          )}
          {activeSeasonName != null && (
            <Text className="text-[11px] font-semibold text-brand-teal mt-[3px]">
              {activeSeasonName}
            </Text>
          )}
        </View>
      </View>

      {/* Active session badge */}
      {hasActiveSession && (
        <View className="flex-row items-center gap-1 mb-[10px]">
          <View className="w-1.5 h-1.5 rounded-full bg-success" />
          <Text className="text-[10px] font-bold text-success uppercase tracking-wide">
            Active Session
          </Text>
        </View>
      )}

      {/* Action button */}
      <Pressable
        testID={hasActiveSession ? `league-continue-${league.id}` : `league-new-${league.id}`}
        onPress={hasActiveSession ? handleContinue : handleStartNew}
        accessibilityRole="button"
        accessibilityLabel={hasActiveSession ? `Continue session in ${league.name}` : `Add game in ${league.name}`}
        className={`w-full py-3 rounded-[10px] items-center justify-center ${
          hasActiveSession ? 'bg-brand-gold' : 'bg-muted'
        }`}
      >
        <Text className={`font-bold text-[15px] ${
          hasActiveSession ? 'text-white' : 'text-default'
        }`}>
          {hasActiveSession ? `Continue (${pluralize(matchCount, 'game')})` : 'Add Game'}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LeagueSelectListProps {
  readonly leagues: readonly (League & { readonly activeSession?: Session | null })[] | undefined;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: Error | null;
  readonly onContinueSession: (session: Session) => void;
  readonly onStartNewSession: (league: League) => void;
  readonly onRetry: () => void;
  readonly onRefresh: () => void;
  readonly onJoinLeague: () => void;
}

export default function LeagueSelectList({
  leagues,
  isLoading,
  isRefreshing,
  error,
  onContinueSession,
  onStartNewSession,
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
        <Text className="text-body text-muted mb-md text-center">
          Could not load your leagues. Please try again.
        </Text>
        <Pressable
          testID="league-list-retry"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          className="px-lg py-sm bg-brand-teal rounded-lg"
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
        <Text className="text-body font-bold text-default mb-sm text-center">
          No leagues yet
        </Text>
        <Text className="text-body text-muted mb-xl text-center">
          You&apos;re not in any leagues yet. Join one to start recording games.
        </Text>
        <Pressable
          testID="league-list-join-cta"
          onPress={onJoinLeague}
          accessibilityRole="button"
          accessibilityLabel="Find leagues"
          className="px-lg py-sm bg-brand-teal rounded-lg"
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
      <Text className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-[10px]">
        Your Leagues
      </Text>
      {leagues!.map((league) => (
        <LeagueRow
          key={league.id}
          league={league}
          onContinue={onContinueSession}
          onStartNew={onStartNewSession}
        />
      ))}
    </ScrollView>
  );
}
