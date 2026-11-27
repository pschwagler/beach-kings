import React from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import type { League } from '@beach-kings/shared';
import { formatLastGameLabel } from '@/features/leagues/presentation';
import { routes } from '@/lib/navigation';
import HomePreviewRow from './HomePreviewRow';

interface LeaguesScrollProps {
  readonly leagues: readonly League[];
  readonly maxItems?: number;
}

function LeagueCard({ league }: { readonly league: League }): React.ReactNode {
  const router = useRouter();
  const memberCount = league.member_count ?? 0;
  const memberLabel = `${memberCount} ${memberCount === 1 ? 'player' : 'players'}`;
  const lastGameLabel = formatLastGameLabel(league.last_game_date);
  const accessibilityLabel = `${league.name}, ${memberLabel}, ${lastGameLabel}`;
  const hasDestination = Number.isInteger(league.id) && league.id > 0;

  const content = (
    <>
      <AppText className="text-footnote font-semibold text-default">
        {league.name}
      </AppText>
      <View className="mt-xs flex-row flex-wrap items-center gap-sm">
        <AppText className="text-[11px] text-tertiary">{memberLabel}</AppText>
        <AppText className="text-[11px] text-muted">{lastGameLabel}</AppText>
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
  maxItems = 2,
}: LeaguesScrollProps): React.ReactNode {
  const activeLeagues = leagues.filter((league) => !league.is_archived);
  if (activeLeagues.length === 0) {
    return <JoinLeagueCard />;
  }

  return (
    <HomePreviewRow testID="my-leagues-row">
      {activeLeagues.slice(0, maxItems).map((league) => (
        <LeagueCard
          key={league.id}
          league={league}
        />
      ))}
    </HomePreviewRow>
  );
}
