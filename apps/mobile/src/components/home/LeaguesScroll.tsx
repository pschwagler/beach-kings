/**
 * Compact league list plus a dashed "+ Join a League" action.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
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
      className="bg-surface rounded-card p-md border border-divider"
    >
      <Text
        className="text-footnote font-semibold text-default leading-[17px]"
        numberOfLines={2}
      >
        {league.name}
      </Text>
      <Text className="text-[11px] text-tertiary mt-xs">
        {memberCount} {memberCount === 1 ? 'player' : 'players'}
      </Text>
      {rank != null && (
        <View className="self-start mt-sm bg-info-tint px-sm py-[3px] rounded-[10px]">
          <Text className="text-[11px] font-semibold text-info">
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
      className="rounded-card p-md border border-dashed border-divider opacity-80"
    >
      <Text className="text-footnote font-semibold text-brand-teal">
        + Join a League
      </Text>
      <Text className="text-[11px] text-tertiary mt-xs">
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
    <View className="gap-2">
      {leagues.slice(0, 3).map((league) => (
        <LeagueCard
          key={league.id}
          league={league}
          rank={getUserRank(league, currentUserPlayerId)}
        />
      ))}
      <JoinLeagueCard />
    </View>
  );
}
