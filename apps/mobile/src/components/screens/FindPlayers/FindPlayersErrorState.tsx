/**
 * Error state for the Find Players screen when data fetching fails.
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { hapticMedium } from '@/utils/haptics';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface FindPlayersErrorStateProps {
  readonly onRetry: () => void;
}

export default function FindPlayersErrorState({
  onRetry,
}: FindPlayersErrorStateProps): React.ReactNode {
  const palette = usePaletteColors();
  const handleRetry = useCallback(() => {
    void hapticMedium();
    onRetry();
  }, [onRetry]);

  return (
    <View
      testID="find-players-error-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <View className="w-16 h-16 rounded-full bg-danger-tint items-center justify-center mb-5">
        <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
          <Path
            d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke={palette.danger}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M12 9v4M12 17h.01"
            stroke={palette.danger}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <AppText className="text-[18px] font-bold text-default mb-2 text-center">
        Could Not Load Players
      </AppText>
      <AppText className="text-[14px] text-muted text-center leading-[1.5] mb-8">
        Something went wrong while fetching players. Check your connection and
        try again.
      </AppText>
      <Pressable
        testID="find-players-retry-btn"
        onPress={handleRetry}
        accessibilityRole="button"
        accessibilityLabel="Try Again"
        className="bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
      >
        <AppText className="text-on-brand-gold font-bold text-[15px]">Try Again</AppText>
      </Pressable>
    </View>
  );
}
