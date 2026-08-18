/**
 * BottomSheet component — slides content up from the bottom.
 * Transparent modal with pressable backdrop to dismiss.
 * Animated slide-in using react-native-reanimated.
 */

import React, { useEffect } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  type AccessibilityFocusRef,
  useModalAccessibility,
} from './useModalAccessibility';

interface BottomSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly snapPoints?: number[];
  readonly className?: string;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly initialFocusRef?: AccessibilityFocusRef;
  readonly returnFocusRef?: AccessibilityFocusRef;
  readonly keyboardAvoidanceEnabled?: boolean;
}

const SLIDE_DURATION = 280;

export default function BottomSheet({
  visible,
  onClose,
  children,
  className = '',
  testID,
  accessibilityLabel = 'Bottom sheet',
  initialFocusRef,
  returnFocusRef,
  keyboardAvoidanceEnabled = true,
}: BottomSheetProps): React.ReactNode {
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(600);
  const { modalRef, focusInitialElement } = useModalAccessibility({
    visible,
    initialFocusRef,
    returnFocusRef,
  });

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {
        duration: reduceMotion ? 0 : SLIDE_DURATION,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      translateY.value = withTiming(600, {
        duration: reduceMotion ? 0 : SLIDE_DURATION,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [reduceMotion, translateY, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onShow={focusInitialElement}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        testID="bottom-sheet-keyboard-avoider"
        style={{ flex: 1 }}
        behavior="padding"
        automaticOffset
        enabled={keyboardAvoidanceEnabled && Platform.OS === 'ios'}
      >
        {/* Backdrop */}
        <Pressable
          testID={testID != null ? `${testID}-backdrop` : 'bottom-sheet-backdrop'}
          className="absolute inset-0 bg-black/50"
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />

        <View className="flex-1 justify-end" pointerEvents="box-none">
          {/* Sheet content */}
          <Animated.View
            ref={modalRef}
            testID={testID}
            style={animatedStyle}
            className={`bg-surface rounded-t-2xl ${className}`}
            role="dialog"
            accessibilityLabel={accessibilityLabel}
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
          >
            {/* Handle bar */}
            <View className="items-center pt-sm pb-xs">
              <View className="w-10 h-1 rounded-full bg-divider" />
            </View>

            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
