/**
 * Error state for My Games when data fetching fails.
 * Shows an error message with a retry button.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { hapticMedium } from '@/utils/haptics';

function AlertIcon(): React.ReactNode {
  return (
    <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        stroke="#b91c1c"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 9v4M12 17h.01"
        stroke="#b91c1c"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface GamesErrorStateProps {
  readonly onRetry: () => void;
}

export default function GamesErrorState({
  onRetry,
}: GamesErrorStateProps): React.ReactNode {
  const handleRetry = useCallback(() => {
    void hapticMedium();
    onRetry();
  }, [onRetry]);

  return (
    <View
      testID="games-error-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      {/* Icon */}
      <View className="w-16 h-16 rounded-full bg-red-50 dark:bg-error-bg items-center justify-center mb-5">
        <AlertIcon />
      </View>

      {/* Title */}
      <Text className="text-[18px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
        Could Not Load Games
      </Text>

      {/* Message */}
      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.5] mb-8">
        Something went wrong while fetching your game history. Check your
        connection and try again.
      </Text>

      {/* Retry */}
      <Pressable
        testID="games-retry-btn"
        onPress={handleRetry}
        accessibilityRole="button"
        accessibilityLabel="Try Again"
        className="bg-accent dark:bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
      >
        <Text className="text-white font-bold text-[15px]">Try Again</Text>
      </Pressable>
    </View>
  );
}
