/**
 * TrophyRow — horizontal scrollable trophy cards.
 *
 * Matches `.trophy-row` / `.trophy-card` in my-stats.html.
 * Place 1 = gold, 2 = silver, 3 = bronze.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { ScrollView, View } from 'react-native';
import type { MyStatsTrophy } from '@beach-kings/shared';
import HorizontalOverflowAffordance from '@/components/ui/HorizontalOverflowAffordance';
import { useHorizontalOverflow } from '@/components/ui/useHorizontalOverflow';

function placeMedal(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

function trophyBg(place: number): string {
  if (place === 1) return 'bg-warning-tint border border-brand-gold';
  if (place === 2) return 'bg-elevated border border-divider';
  return 'bg-warning-tint border border-divider';
}

function trophyPlaceColor(place: number): string {
  if (place === 1) return 'text-warning';
  if (place === 2) return 'text-muted';
  return 'text-warning';
}

interface TrophyCardProps {
  readonly trophy: MyStatsTrophy;
  readonly index: number;
  readonly total: number;
}

function TrophyCard({ trophy, index, total }: TrophyCardProps): React.ReactNode {
  return (
    <View
      role="listitem"
      accessible
      accessibilityLabel={`${placeMedal(trophy.place)} place, ${trophy.league_name}, ${trophy.season_name}`}
      accessibilityValue={{ text: `${index + 1} of ${total}` }}
      className={`min-w-[100px] rounded-[10px] p-[10px] items-center ${trophyBg(trophy.place)}`}
    >
      {/* Trophy icon: medal emoji rendered as text for simplicity */}
      <AppText className="text-[22px] mb-[3px]">
        {trophy.place === 1 ? '\uD83E\uDD47' : trophy.place === 2 ? '\uD83E\uDD48' : '\uD83E\uDD49'}
      </AppText>
      <AppText className={`text-[10px] font-bold ${trophyPlaceColor(trophy.place)}`}>
        {placeMedal(trophy.place)} Place
      </AppText>
      <AppText className="text-[10px] text-muted mt-[2px] text-center leading-[1.3]">
        {trophy.league_name}
      </AppText>
      <AppText className="text-[9px] text-muted text-center leading-[1.3]">
        {trophy.season_name}
      </AppText>
    </View>
  );
}

interface TrophyRowProps {
  readonly trophies: readonly MyStatsTrophy[];
}

export default function TrophyRow({ trophies }: TrophyRowProps): React.ReactNode {
  const overflow = useHorizontalOverflow();

  if (trophies.length === 0) {
    return (
      <AppText className="text-[13px] text-muted italic">
        No trophies yet — keep playing!
      </AppText>
    );
  }

  return (
    <View className="relative">
      <ScrollView
        ref={overflow.scrollRef}
        testID="trophy-row"
        horizontal
        role="list"
        accessibilityLabel="Trophies"
        accessibilityHint={overflow.canScrollForward || overflow.canScrollBackward
          ? 'Swipe left or right to see more trophies'
          : undefined}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingBottom: 4, paddingRight: 28 }}
        onLayout={overflow.onLayout}
        onContentSizeChange={overflow.onContentSizeChange}
        onScroll={overflow.onScroll}
        scrollEventThrottle={16}
      >
        {trophies.map((trophy, index) => (
          <TrophyCard
            key={`${trophy.league_id}-${trophy.season_name}`}
            trophy={trophy}
            index={index}
            total={trophies.length}
          />
        ))}
      </ScrollView>
      <HorizontalOverflowAffordance
        backward={overflow.canScrollBackward}
        forward={overflow.canScrollForward}
        surfaceClassName="bg-page"
      />
    </View>
  );
}
