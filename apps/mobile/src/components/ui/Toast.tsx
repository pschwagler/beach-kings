/**
 * Toast — slides down from top using reanimated, auto-dismisses after 3s.
 * Types: success (green), error (red), info (blue).
 */

import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import AppText from './AppText';

interface ToastProps {
  readonly message: string;
  readonly type: 'success' | 'error' | 'info';
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly className?: string;
}

const TYPE_STYLES: Record<ToastProps['type'], string> = {
  success: 'bg-success-fill',
  error: 'bg-danger-fill',
  info: 'bg-info-fill',
};

const TYPE_TEXT_STYLES: Record<ToastProps['type'], string> = {
  success: 'text-on-success',
  error: 'text-on-danger',
  info: 'text-on-info',
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
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(-100);

  useEffect(() => {
    if (visible) {
      translateY.value = reduceMotion
        ? 0
        : withTiming(0, {
            duration: SLIDE_IN_MS,
            easing: Easing.out(Easing.ease),
          });
      translateY.value = withDelay(
        VISIBLE_MS,
        withTiming(
          -100,
          { duration: reduceMotion ? 0 : SLIDE_OUT_MS },
          (finished) => {
            if (finished) runOnJS(onDismiss)();
          },
        ),
      );
    } else {
      translateY.value = -100;
    }
  }, [visible, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[animatedStyle]}
      className={`absolute top-0 left-0 right-0 z-50 mx-4 mt-safe-top rounded-xl px-4 py-3 shadow-lg ${TYPE_STYLES[type]} ${className}`}
    >
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <AppText className={`${TYPE_TEXT_STYLES[type]} text-sm font-medium`}>
          {message}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}
