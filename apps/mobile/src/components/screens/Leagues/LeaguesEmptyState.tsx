/**
 * Empty state shown when the user belongs to no leagues.
 * Mirrors the `.empty-state-wrap` block in leagues-tab.html wireframe.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { TrophyIcon } from '@/components/ui/icons';

interface LeaguesEmptyStateProps {
  readonly onFindLeagues: () => void;
  readonly onCreateLeague: () => void;
}

export default function LeaguesEmptyState({
  onFindLeagues,
  onCreateLeague,
}: LeaguesEmptyStateProps): React.ReactNode {
  return (
    <View
      testID="leagues-empty-state"
      className="flex-1 items-center justify-center px-lg pt-xl"
    >
      <View className="bg-teal-tint dark:bg-info-bg rounded-full p-lg mb-lg">
        <TrophyIcon size={32} color="#2a7d9c" />
      </View>

      <Text className="text-headline font-bold text-text-default dark:text-content-primary text-center mb-xs">
        No Leagues Yet
      </Text>
      <Text className="text-footnote text-gray-500 dark:text-content-tertiary text-center mb-xl">
        Join a league to start playing and tracking your stats
      </Text>

      <Pressable
        testID="find-leagues-cta"
        onPress={onFindLeagues}
        accessibilityRole="button"
        accessibilityLabel="Find a League"
        className="w-full bg-accent dark:bg-brand-teal rounded-card py-md mb-sm items-center min-h-touch justify-center"
      >
        <Text className="text-white font-semibold text-callout">Find a League</Text>
      </Pressable>

      <Pressable
        onPress={onCreateLeague}
        accessibilityRole="button"
        accessibilityLabel="Create a League"
        className="w-full bg-teal-tint dark:bg-info-bg rounded-card py-md items-center min-h-touch justify-center"
      >
        <Text className="text-accent dark:text-brand-teal font-semibold text-callout">
          Create a League
        </Text>
      </Pressable>
    </View>
  );
}
