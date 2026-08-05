/**
 * Leagues section for the Player Profile screen.
 * Lists leagues the player participates in with rank and game count.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import { hapticLight } from '@/utils/haptics';
import { pluralize } from '@/lib/formatters';
import type { PlayerLeague } from '@beach-kings/shared';

interface PlayerLeaguesListProps {
  readonly leagues: readonly PlayerLeague[];
  readonly onLeaguePress: (id: number) => void;
}

export default function PlayerLeaguesList({
  leagues,
  onLeaguePress,
}: PlayerLeaguesListProps): React.ReactNode {
  if (leagues.length === 0) return null;

  return (
    <View
      testID="player-leagues-list"
      className="bg-elevated px-lg pt-md pb-lg mt-sm mb-[100px]"
    >
      <AppText className="text-[15px] font-bold text-default mb-md">
        Leagues
      </AppText>

      {leagues.map((league) => (
        <Pressable
          key={league.id}
          testID={`league-row-${league.id}`}
          onPress={() => {
            void hapticLight();
            onLeaguePress(league.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={league.name}
          className="flex-row items-center gap-md py-sm border-b border-strong last:border-0 active:opacity-70"
        >
          {/* Icon */}
          <View className="w-[40px] h-[40px] rounded-xl bg-info-tint items-center justify-center flex-shrink-0">
            <AppText className="text-lg text-brand-teal">L</AppText>
          </View>

          {/* Info */}
          <View className="flex-1">
            <AppText className="text-sm font-semibold text-default">
              {league.name}
            </AppText>
            <AppText className="text-xs text-muted mt-[2px]">
              {league.rank != null ? `Ranked #${league.rank} · ` : ''}
              {pluralize(league.games_played, 'game')}
            </AppText>
          </View>

          {/* Chevron */}
          <AppText className="text-text-disabled text-lg">›</AppText>
        </Pressable>
      ))}
    </View>
  );
}
