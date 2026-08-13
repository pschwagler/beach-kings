import React from 'react';
import { View } from 'react-native';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface HorizontalOverflowAffordanceProps {
  readonly backward: boolean;
  readonly forward: boolean;
  readonly surfaceClassName?: 'bg-page' | 'bg-surface';
}

/** Visual-only edge cues. They never intercept touch or accessibility focus. */
export default function HorizontalOverflowAffordance({
  backward,
  forward,
  surfaceClassName = 'bg-surface',
}: HorizontalOverflowAffordanceProps): React.ReactNode {
  const palette = usePaletteColors();

  return (
    <>
      {backward && (
        <View
          testID="horizontal-overflow-backward"
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className={`absolute bottom-0 left-0 top-0 w-7 items-center justify-center ${surfaceClassName}`}
        >
          <ChevronLeftIcon size={16} color={palette.textMuted} />
        </View>
      )}
      {forward && (
        <View
          testID="horizontal-overflow-forward"
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className={`absolute bottom-0 right-0 top-0 w-7 items-center justify-center ${surfaceClassName}`}
        >
          <ChevronRightIcon size={16} color={palette.textMuted} />
        </View>
      )}
    </>
  );
}
