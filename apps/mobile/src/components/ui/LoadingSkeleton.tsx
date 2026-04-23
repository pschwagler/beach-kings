/**
 * LoadingSkeleton component — animated shimmer placeholder.
 * Uses react-native-reanimated opacity pulse (0.3 → 0.7 → 0.3, 1.5s loop).
 */

import React, { useEffect } from 'react';
import type { DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface LoadingSkeletonProps {
  readonly width?: DimensionValue;
  readonly height?: number;
  readonly borderRadius?: number;
  readonly className?: string;
}

export default function LoadingSkeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  className = '',
}: LoadingSkeletonProps): React.ReactNode {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius }, animatedStyle]}
      className={`bg-gray-300 dark:bg-gray-600 ${className}`}
      accessibilityRole="none"
      accessible={false}
    />
  );
}
