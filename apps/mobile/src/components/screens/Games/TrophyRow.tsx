/**
 * TrophyRow — horizontal scrollable trophy cards.
 *
 * Matches `.trophy-row` / `.trophy-card` in my-stats.html.
 * Place 1 = gold, 2 = silver, 3 = bronze.
 */

import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import type { MyStatsTrophy } from '@beach-kings/shared';

function placeMedal(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

function trophyBg(place: number): string {
  if (place === 1) return 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50';
  if (place === 2) return 'bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-600/50';
  return 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/50';
}

function trophyPlaceColor(place: number): string {
  if (place === 1) return 'text-yellow-700 dark:text-yellow-400';
  if (place === 2) return 'text-gray-500 dark:text-gray-400';
  return 'text-orange-700 dark:text-orange-400';
}

interface TrophyCardProps {
  readonly trophy: MyStatsTrophy;
}

function TrophyCard({ trophy }: TrophyCardProps): React.ReactNode {
  return (
    <View
      className={`min-w-[100px] rounded-[10px] p-[10px] items-center ${trophyBg(trophy.place)}`}
    >
      {/* Trophy icon: medal emoji rendered as text for simplicity */}
      <Text className="text-[22px] mb-[3px]">
        {trophy.place === 1 ? '\uD83E\uDD47' : trophy.place === 2 ? '\uD83E\uDD48' : '\uD83E\uDD49'}
      </Text>
      <Text className={`text-[10px] font-bold ${trophyPlaceColor(trophy.place)}`}>
        {placeMedal(trophy.place)} Place
      </Text>
      <Text className="text-[10px] text-text-muted dark:text-content-tertiary mt-[2px] text-center leading-[1.3]">
        {trophy.league_name}
      </Text>
      <Text className="text-[9px] text-text-muted dark:text-content-tertiary text-center leading-[1.3]">
        {trophy.season_name}
      </Text>
    </View>
  );
}

interface TrophyRowProps {
  readonly trophies: readonly MyStatsTrophy[];
}

export default function TrophyRow({ trophies }: TrophyRowProps): React.ReactNode {
  if (trophies.length === 0) {
    return (
      <Text className="text-[13px] text-text-muted dark:text-content-tertiary italic">
        No trophies yet — keep playing!
      </Text>
    );
  }

  return (
    <ScrollView
      testID="trophy-row"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
    >
      {trophies.map((trophy) => (
        <TrophyCard key={`${trophy.league_id}-${trophy.season_name}`} trophy={trophy} />
      ))}
    </ScrollView>
  );
}
