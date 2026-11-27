import React from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import type { League } from '@beach-kings/shared';
import { formatOrdinal } from '@/lib/formatters';
import { routes } from '@/lib/navigation';
import HomePreviewRow from './HomePreviewRow';

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
  const memberLabel = `${memberCount} ${memberCount === 1 ? 'player' : 'players'}`;
  const rankLabel = rank == null ? null : `${formatOrdinal(rank)} Ranked`;
  const accessibilityLabel = [`League ${league.name}`, memberLabel, rankLabel].filter(Boolean).join(', ');
  const hasDestination = Number.isInteger(league.id) && league.id > 0;

  const content = (
    <>
      <AppText className="text-footnote font-semibold text-default">
        {league.name}
      </AppText>
      <View className="mt-xs flex-row flex-wrap items-center gap-sm">
        <AppText className="text-[11px] text-tertiary">{memberLabel}</AppText>
        {rankLabel != null && (
          <View className="bg-info-tint px-sm py-[3px] rounded-chip">
            <AppText className="text-[11px] font-semibold text-info">{rankLabel}</AppText>
          </View>
        )}
      </View>
    </>
  );

  if (!hasDestination) {
    return (
      <View className="grow min-h-touch bg-surface rounded-card p-sm border border-divider">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(routes.league(league.id))}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      className="grow min-h-touch bg-surface rounded-card p-sm border border-divider"
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
  if (leagues.length === 0) {
    return <JoinLeagueCard />;
  }

  return (
    <HomePreviewRow testID="my-leagues-row">
      {visibleLeagues.map((league) => (
        <LeagueCard
          key={league.id}
          league={league}
          rank={getUserRank(league, currentUserPlayerId)}
        />
      ))}
    </HomePreviewRow>
  );
}
