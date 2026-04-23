/**
 * Error state for the Player Profile screen.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface PlayerProfileErrorStateProps {
  readonly onRetry: () => void;
}

export default function PlayerProfileErrorState({
  onRetry,
}: PlayerProfileErrorStateProps): React.ReactNode {
  return (
    <View
      testID="player-profile-error"
      className="flex-1 items-center justify-center px-xl py-xxxl"
      accessibilityRole="alert"
    >
      <Text className="text-base font-semibold text-text-default dark:text-content-primary text-center mb-sm">
        Could not load profile
      </Text>
      <Text className="text-sm text-text-muted dark:text-text-tertiary text-center mb-lg">
        Check your connection and try again.
      </Text>
      <Pressable
        testID="player-profile-retry-btn"
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading profile"
        className="bg-primary dark:bg-brand-teal px-xl py-sm rounded-xl active:opacity-80"
      >
        <Text className="text-white font-semibold text-sm">Retry</Text>
      </Pressable>
    </View>
  );
}
