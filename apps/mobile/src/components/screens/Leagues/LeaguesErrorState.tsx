/**
 * Error state for the Leagues tab — shown when data fetching fails.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface LeaguesErrorStateProps {
  readonly onRetry: () => void;
}

export default function LeaguesErrorState({
  onRetry,
}: LeaguesErrorStateProps): React.ReactNode {
  return (
    <View
      testID="leagues-error-state"
      className="flex-1 items-center justify-center px-lg"
    >
      <Text className="text-headline font-bold text-text-default dark:text-content-primary text-center mb-xs">
        Could not load leagues
      </Text>
      <Text className="text-footnote text-gray-500 dark:text-content-tertiary text-center mb-xl">
        Check your connection and try again.
      </Text>
      <Pressable
        testID="retry-btn"
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading leagues"
        className="bg-accent dark:bg-brand-teal rounded-card px-xl py-sm min-h-touch items-center justify-center active:opacity-80"
      >
        <Text className="text-white font-semibold text-callout">Try Again</Text>
      </Pressable>
    </View>
  );
}
