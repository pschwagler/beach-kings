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
    <View className="bg-white dark:bg-dark-surface rounded-card p-xl items-center border-[1.5px] border-dashed border-gray-300 dark:border-border-subtle shadow-sm dark:shadow-none">
      <Text className="text-subhead font-semibold text-text-default dark:text-content-primary mb-1">
        Browse Tournaments Near You
      </Text>
      <Text className="text-caption text-gray-600 dark:text-content-tertiary mb-md text-center">
        Find and join KoB events at courts in your area
      </Text>
      <View className="flex-row gap-sm justify-center">
        <Pressable
          onPress={() => router.push(routes.tournaments())}
          accessibilityRole="link"
          className="bg-primary dark:bg-brand-teal rounded-[10px] px-lg py-sm min-h-touch items-center justify-center"
        >
          <Text className="text-white font-semibold text-footnote">
            Browse Nearby
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(routes.createTournament())}
          accessibilityRole="link"
          className="bg-gray-100 dark:bg-elevated rounded-[10px] px-lg py-sm min-h-touch items-center justify-center border border-gray-200 dark:border-border-subtle"
        >
          <Text className="text-primary dark:text-content-primary font-semibold text-footnote">
            + Create
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
