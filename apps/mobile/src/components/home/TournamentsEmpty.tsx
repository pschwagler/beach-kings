/**
 * Dashed empty-state CTA for the Tournaments section when the user has none upcoming.
 * Mirrors `home.html` `.tourney-empty-cta`.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { routes } from '@/lib/navigation';

export default function TournamentsEmpty(): React.ReactNode {
  const router = useRouter();

  return (
    <View className="bg-surface rounded-card p-xl items-center border-[1.5px] border-dashed border-divider shadow-sm dark:shadow-none">
      <Text className="text-subhead font-semibold text-default mb-1">
        Browse Tournaments Near You
      </Text>
      <Text className="text-caption text-tertiary mb-md text-center">
        Find and join KoB events at courts in your area
      </Text>
      <View className="flex-row gap-sm justify-center">
        <Pressable
          onPress={() => router.push(routes.tournaments())}
          accessibilityRole="link"
          className="bg-brand-teal rounded-[10px] px-lg py-sm min-h-touch items-center justify-center"
        >
          <Text className="text-white font-semibold text-footnote">
            Browse Nearby
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(routes.createTournament())}
          accessibilityRole="link"
          className="bg-elevated rounded-[10px] px-lg py-sm min-h-touch items-center justify-center border border-divider"
        >
          <Text className="text-brand-teal font-semibold text-footnote">
            + Create
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
