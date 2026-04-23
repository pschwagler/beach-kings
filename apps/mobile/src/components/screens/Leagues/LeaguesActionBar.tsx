/**
 * Action bar with "Find Leagues" and "Create League" buttons.
 * Mirrors the `.action-bar` row in leagues-tab.html wireframe.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SearchIcon, PlusIcon } from '@/components/ui/icons';

interface LeaguesActionBarProps {
  readonly onFindLeagues: () => void;
  readonly onCreateLeague: () => void;
}

export default function LeaguesActionBar({
  onFindLeagues,
  onCreateLeague,
}: LeaguesActionBarProps): React.ReactNode {
  return (
    <View className="flex-row gap-sm px-lg py-sm bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-border-subtle">
      <Pressable
        testID="find-leagues-btn"
        onPress={onFindLeagues}
        accessibilityRole="button"
        accessibilityLabel="Find Leagues"
        className="flex-1 flex-row items-center justify-center gap-xs bg-teal-tint dark:bg-info-bg rounded-[10px] py-sm min-h-touch active:opacity-80"
      >
        <SearchIcon size={14} color="#2a7d9c" />
        <Text className="text-footnote font-semibold text-accent dark:text-info-text">
          Find Leagues
        </Text>
      </Pressable>

      <Pressable
        testID="create-league-btn"
        onPress={onCreateLeague}
        accessibilityRole="button"
        accessibilityLabel="Create League"
        className="flex-1 flex-row items-center justify-center gap-xs bg-[#1a3a4a] dark:bg-brand-teal rounded-[10px] py-sm min-h-touch active:opacity-80"
      >
        <PlusIcon size={14} color="#ffffff" />
        <Text className="text-footnote font-semibold text-white">
          Create League
        </Text>
      </Pressable>
    </View>
  );
}
