/**
 * BottomSheet component — slides content up from the bottom.
 * Transparent modal with pressable backdrop to dismiss.
 * Animated slide-in using react-native-reanimated.
 */

import React, { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface BottomSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly snapPoints?: number[];
  readonly className?: string;
}

const SLIDE_DURATION = 280;

export default function BottomSheet({
  visible,
  onClose,
  children,
  className = '',
}: BottomSheetProps): React.ReactNode {
  const translateY = useSharedValue(600);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {
        duration: SLIDE_DURATION,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      translateY.value = withTiming(600, {
        duration: SLIDE_DURATION,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [visible, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />

      {/* Sheet content */}
      <Animated.View
        style={animatedStyle}
        className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-dark-surface rounded-t-2xl ${className}`}
      >
        {/* Handle bar */}
        <View className="items-center pt-sm pb-xs">
          <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </View>

        {children}
      </Animated.View>
    </Modal>
  );
}
