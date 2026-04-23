/**
 * Empty state for My Games when the user has no recorded games.
 * Matches the `.empty-state-wrap` shape in the my-games wireframe:
 *   icon → title → subtitle → CTA button.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';

function VolleyballIcon(): React.ReactNode {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#2a7d9c" strokeWidth={1.5} />
      <Path
        d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
        stroke="#2a7d9c"
        strokeWidth={1.5}
      />
      <Path d="M2 12h20" stroke="#2a7d9c" strokeWidth={1.5} />
    </Svg>
  );
}

export default function GamesEmptyState(): React.ReactNode {
  const router = useRouter();

  const handleAddGame = useCallback(() => {
    void hapticMedium();
    router.push(routes.addGames());
  }, [router]);

  return (
    <View
      testID="games-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      {/* Icon */}
      <View className="w-20 h-20 rounded-full bg-teal-50 dark:bg-info-bg items-center justify-center mb-5">
        <VolleyballIcon />
      </View>

      {/* Title */}
      <Text className="text-[20px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
        No Games Yet
      </Text>

      {/* Subtitle */}
      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.5] mb-8">
        Record your beach volleyball games to start tracking your stats and
        climbing the rankings.
      </Text>

      {/* CTA */}
      <Pressable
        testID="add-first-game-btn"
        onPress={handleAddGame}
        accessibilityRole="button"
        accessibilityLabel="Add Your First Game"
        className="bg-accent dark:bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
      >
        <Text className="text-white font-bold text-[15px]">
          Add Your First Game
        </Text>
      </Pressable>
    </View>
  );
}
