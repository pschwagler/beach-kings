/**
 * Compact league list plus a dashed "+ Join a League" action.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import type { League } from '@beach-kings/shared';
import { formatOrdinal } from '@/lib/formatters';
import { routes } from '@/lib/navigation';

interface LeaguesScrollProps {
  readonly leagues: readonly League[];
  readonly currentUserPlayerId?: number | null;
  readonly maxItems?: number;
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
  const hasDestination = Number.isInteger(league.id) && league.id > 0;

  const content = (
    <>
      <AppText
        className="text-footnote font-semibold text-default leading-[17px]"
        numberOfLines={2}
      >
        {league.name}
      </AppText>
      <AppText className="text-[11px] text-tertiary mt-xs">
        {memberCount} {memberCount === 1 ? 'player' : 'players'}
      </AppText>
      {rank != null && (
        <View className="self-start mt-sm bg-info-tint px-sm py-[3px] rounded-[10px]">
          <AppText className="text-[11px] font-semibold text-info">
            {formatOrdinal(rank)} Ranked
          </AppText>
        </View>
      )}
    </>
  );

  if (!hasDestination) {
    return (
      <View className="bg-surface rounded-card p-md border border-divider">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(routes.league(league.id))}
      accessibilityRole="link"
      accessibilityLabel={`League ${league.name}`}
      className="bg-surface rounded-card p-md border border-divider"
    >
      {content}
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
      <AppText className="text-footnote font-semibold text-brand-teal">
        + Join a League
      </AppText>
      <AppText className="text-[11px] text-tertiary mt-xs">
        Browse open leagues near you
      </AppText>
    </Pressable>
  );
}

export default function LeaguesScroll({
  leagues,
  currentUserPlayerId,
  maxItems = 2,
}: LeaguesScrollProps): React.ReactNode {
  const visibleLeagues = leagues.slice(0, maxItems);
  return (
    <View className="gap-2">
      {visibleLeagues.map((league) => (
        <LeagueCard
          key={league.id}
          league={league}
          rank={getUserRank(league, currentUserPlayerId)}
        />
      ))}
      {leagues.length === 0 && <JoinLeagueCard />}
    </View>
  );
}
