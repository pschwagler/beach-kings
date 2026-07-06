/**
 * Error state for the Player Profile screen.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface PlayerProfileErrorStateProps {
  readonly onRetry: () => void;
  /**
   * The profile 404'd (hidden by design — e.g. players with no games are not
   * publicly visible). Shows explanatory copy instead of the connection
   * message, and no Retry since retrying can never succeed.
   */
  readonly notFound?: boolean;
}

export default function PlayerProfileErrorState({
  onRetry,
  notFound = false,
}: PlayerProfileErrorStateProps): React.ReactNode {
  return (
    <View
      testID="player-profile-error"
      className="flex-1 items-center justify-center px-xl py-xxxl"
      accessibilityRole="alert"
    >
      <Text className="text-base font-semibold text-default text-center mb-sm">
        {notFound ? 'Profile not available' : 'Could not load profile'}
      </Text>
      <Text className="text-sm text-muted text-center mb-lg">
        {notFound
          ? "This player's profile isn't available yet."
          : 'Check your connection and try again.'}
      </Text>
      {!notFound && (
        <Pressable
          testID="player-profile-retry-btn"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
          className="bg-brand-teal px-xl py-sm rounded-xl active:opacity-80"
        >
          <Text className="text-white font-semibold text-sm">Retry</Text>
        </Pressable>
      )}
    </View>
  );
}
