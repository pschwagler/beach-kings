/**
 * Leagues tab screen.
 * Mirrors `mobile-audit/wireframes/leagues-tab.html`.
 *
 * States: loading (skeleton) → error → empty → populated list.
 */

import React, { useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { League } from '@beach-kings/shared';
import { routes } from '@/lib/navigation';
import { hapticLight } from '@/utils/haptics';
import TopNav from '@/components/ui/TopNav';
import { useLeaguesScreen } from '@/components/screens/Leagues/useLeaguesScreen';
import LeaguesSkeleton from '@/components/screens/Leagues/LeaguesSkeleton';
import LeagueCard from '@/components/screens/Leagues/LeagueCard';
import LeaguesEmptyState from '@/components/screens/Leagues/LeaguesEmptyState';
import LeaguesErrorState from '@/components/screens/Leagues/LeaguesErrorState';
import LeaguesActionBar from '@/components/screens/Leagues/LeaguesActionBar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserStandingRow(
  league: League,
  playerId: number | null | undefined,
) {
  if (playerId == null || league.standings == null) return null;
  return league.standings.find((r) => r.player_id === playerId) ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LeaguesScreen(): React.ReactNode {
  const router = useRouter();
  const { leagues, player, isLoading, isRefreshing, isError, onRefresh, onRetry } =
    useLeaguesScreen();

  const playerId = player?.id ?? null;

  const handleFindLeagues = useCallback(() => {
    void hapticLight();
    router.push(routes.findLeagues());
  }, [router]);

  const handleCreateLeague = useCallback(() => {
    void hapticLight();
    router.push(routes.createLeague());
  }, [router]);

  const handleLeaguePress = useCallback(
    (league: League) => {
      void hapticLight();
      router.push(routes.league(league.id));
    },
    [router],
  );

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base" edges={['top']}>
      <TopNav title="Leagues" />

      {/* Action bar — always visible (not part of scroll) */}
      <LeaguesActionBar
        onFindLeagues={handleFindLeagues}
        onCreateLeague={handleCreateLeague}
      />

      {isLoading ? (
        <LeaguesSkeleton />
      ) : isError ? (
        <LeaguesErrorState onRetry={onRetry} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={
            leagues.length === 0 ? { flex: 1 } : undefined
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#2a7d9c"
            />
          }
        >
          {leagues.length === 0 ? (
            <LeaguesEmptyState
              onFindLeagues={handleFindLeagues}
              onCreateLeague={handleCreateLeague}
            />
          ) : (
            <View className="px-lg pt-md pb-xxxl">
              <Text className="text-callout font-bold text-text-default dark:text-content-primary mb-md">
                My Leagues
              </Text>

              {leagues.map((league) => {
                const standing = getUserStandingRow(league, playerId);
                return (
                  <LeagueCard
                    key={league.id}
                    league={league}
                    userRank={standing?.season_rank ?? null}
                    userWins={standing?.wins ?? 0}
                    userLosses={standing?.losses ?? 0}
                    onPress={() => handleLeaguePress(league)}
                  />
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
