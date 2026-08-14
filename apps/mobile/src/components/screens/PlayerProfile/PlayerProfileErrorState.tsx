/**
 * Error state for the Player Profile screen.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';

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
      <AppText className="text-base font-semibold text-default text-center mb-sm">
        {notFound ? 'Profile not available' : 'Could not load profile'}
      </AppText>
      <AppText className="text-sm text-muted text-center mb-lg">
        {notFound
          ? "This player's profile isn't available yet."
          : 'Check your connection and try again.'}
      </AppText>
      {!notFound && (
        <Pressable
          testID="player-profile-retry-btn"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
          className="min-h-touch bg-brand-teal px-xl rounded-xl items-center justify-center active:opacity-80"
        >
          <AppText className="text-on-brand-teal font-semibold text-sm">Retry</AppText>
        </Pressable>
      )}
    </View>
  );
}
