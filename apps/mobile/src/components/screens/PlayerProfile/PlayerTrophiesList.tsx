/**
 * Trophies section for the Player Profile screen.
 * Horizontally scrollable trophy cards.
 */

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { PlayerTrophy } from './usePlayerProfileScreen';

interface PlayerTrophiesListProps {
  readonly trophies: readonly PlayerTrophy[];
}

const PLACE_COLORS: Record<number, string> = {
  1: '#d4a843',
  2: '#b0b0b0',
  3: '#cd7f32',
};

const PLACE_LABELS: Record<number, string> = {
  1: '1st Place',
  2: '2nd Place',
  3: '3rd Place',
};

export default function PlayerTrophiesList({
  trophies,
}: PlayerTrophiesListProps): React.ReactNode {
  if (trophies.length === 0) return null;

  return (
    <View
      testID="player-trophies-list"
      className="bg-white dark:bg-elevated px-lg pt-md pb-lg"
    >
      <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-md">
        Trophies
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {trophies.map((trophy, index) => {
            const placeLabel = PLACE_LABELS[trophy.place] ?? `${trophy.place}th Place`;
            const placeColor = PLACE_COLORS[trophy.place] ?? '#888';

            return (
              <View
                key={`${trophy.league_id}-${trophy.season_name}-${index}`}
                testID={`trophy-card-${index}`}
                className="min-w-[120px] bg-gold/10 dark:bg-gold/10 rounded-xl p-sm items-center border border-gold/30"
              >
                <Text className="text-[28px] mb-xs">T</Text>
                <Text
                  className="text-[12px] font-bold"
                  style={{ color: placeColor }}
                >
                  {placeLabel}
                </Text>
                <Text className="text-[11px] text-text-muted dark:text-text-tertiary mt-[3px] text-center leading-[1.3]">
                  {trophy.league_name}
                </Text>
                <Text className="text-[10px] text-text-disabled mt-[2px]">
                  {trophy.season_name}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
