/**
 * Toast — slides down from top using reanimated, auto-dismisses after 3s.
 * Types: success (green), error (red), info (blue).
 */

import React, { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

interface ToastProps {
  readonly message: string;
  readonly type: 'success' | 'error' | 'info';
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly className?: string;
}

const TYPE_STYLES: Record<ToastProps['type'], string> = {
  success: 'bg-green-700',
  error: 'bg-red-700',
  info: 'bg-blue-700',
};

const SLIDE_IN_MS = 300;
const VISIBLE_MS = 3000;
const SLIDE_OUT_MS = 300;

export default function Toast({
  message,
  type,
  visible,
  onDismiss,
  className = '',
}: ToastProps): React.ReactNode {
  const translateY = useSharedValue(-100);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {
        duration: SLIDE_IN_MS,
        easing: Easing.out(Easing.ease),
      });
      translateY.value = withDelay(
        VISIBLE_MS,
        withTiming(-100, { duration: SLIDE_OUT_MS }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        }),
      );
    } else {
      translateY.value = -100;
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[animatedStyle]}
      className={`absolute top-0 left-0 right-0 z-50 mx-4 mt-safe-top rounded-xl px-4 py-3 shadow-lg ${TYPE_STYLES[type]} ${className}`}
    >
      <Pressable onPress={onDismiss} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text className="text-white text-sm font-medium">{message}</Text>
      </Pressable>
    </Animated.View>
  );
}
