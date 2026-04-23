/**
 * Leagues section for the Player Profile screen.
 * Lists leagues the player participates in with rank and game count.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { hapticLight } from '@/utils/haptics';
import type { PlayerLeague } from './usePlayerProfileScreen';

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
      className="bg-white dark:bg-elevated px-lg pt-md pb-lg mt-sm mb-[100px]"
    >
      <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-md">
        Leagues
      </Text>

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
          className="flex-row items-center gap-md py-sm border-b border-border dark:border-border-strong last:border-0 active:opacity-70"
        >
          {/* Icon */}
          <View className="w-[40px] h-[40px] rounded-xl bg-brand-teal/10 items-center justify-center flex-shrink-0">
            <Text className="text-lg text-brand-teal">L</Text>
          </View>

          {/* Info */}
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-default dark:text-content-primary">
              {league.name}
            </Text>
            <Text className="text-xs text-text-muted dark:text-text-tertiary mt-[2px]">
              {league.rank != null ? `Ranked #${league.rank} · ` : ''}
              {league.games_played} games
            </Text>
          </View>

          {/* Chevron */}
          <Text className="text-text-disabled text-lg">›</Text>
        </Pressable>
      ))}
    </View>
  );
}
