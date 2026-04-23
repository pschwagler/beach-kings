/**
 * Horizontal scroller of the user's leagues + a dashed "+ Join a League" card.
 * Mirrors `home.html` `.league-scroll` + `.league-card`.
 */

import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { League } from '@beach-kings/shared';
import { formatOrdinal } from '@/lib/formatters';
import { routes } from '@/lib/navigation';

interface LeaguesScrollProps {
  readonly leagues: readonly League[];
  readonly currentUserPlayerId?: number | null;
}

function getUserRank(
  league: League,
  playerId: number | null | undefined,
): number | null {
  if (playerId == null || league.standings == null) return null;
  const row = league.standings.find((r) => r.player_id === playerId);
  return row?.season_rank ?? null;
}

function LeagueCard({
  league,
  rank,
}: {
  readonly league: League;
  readonly rank: number | null;
}): React.ReactNode {
  const router = useRouter();
  const memberCount = league.member_count ?? 0;

  return (
    <Pressable
      onPress={() => router.push(routes.league(league.id))}
      accessibilityRole="link"
      accessibilityLabel={`League ${league.name}`}
      className="min-w-[150px] bg-white dark:bg-dark-surface rounded-card p-md shadow-sm dark:shadow-none dark:border dark:border-border-subtle"
    >
      <Text
        className="text-footnote font-semibold text-text-default dark:text-content-primary leading-[17px]"
        numberOfLines={2}
      >
        {league.name}
      </Text>
      <Text className="text-[11px] text-gray-600 dark:text-content-tertiary mt-xs">
        {memberCount} {memberCount === 1 ? 'player' : 'players'}
      </Text>
      {rank != null && (
        <View className="self-start mt-sm bg-teal-tint dark:bg-info-bg px-sm py-[3px] rounded-[10px]">
          <Text className="text-[11px] font-semibold text-accent dark:text-info-text">
            {formatOrdinal(rank)} Ranked
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function JoinLeagueCard(): React.ReactNode {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(routes.findLeagues())}
      accessibilityRole="link"
      accessibilityLabel="Join a league"
      className="min-w-[150px] rounded-card p-md border border-dashed border-gray-300 dark:border-border-subtle opacity-80"
    >
      <Text className="text-footnote font-semibold text-accent dark:text-brand-teal">
        + Join a League
      </Text>
      <Text className="text-[11px] text-gray-600 dark:text-content-tertiary mt-xs">
        Browse open leagues near you
      </Text>
    </Pressable>
  );
}

export default function LeaguesScroll({
  leagues,
  currentUserPlayerId,
}: LeaguesScrollProps): React.ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
    >
      {leagues.map((league) => (
        <LeagueCard
          key={league.id}
          league={league}
          rank={getUserRank(league, currentUserPlayerId)}
        />
      ))}
      <JoinLeagueCard />
    </ScrollView>
  );
}
