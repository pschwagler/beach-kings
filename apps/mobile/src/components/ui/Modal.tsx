/**
 * Modal component — full-screen modal with slide-up animation.
 * Handle bar at top, optional title row, X close button.
 */

import React from 'react';
import { Modal as RNModal, View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  type AccessibilityFocusRef,
  useModalAccessibility,
} from './useModalAccessibility';

interface ModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly initialFocusRef?: AccessibilityFocusRef;
  readonly returnFocusRef?: AccessibilityFocusRef;
  readonly testID?: string;
}

export default function Modal({
  visible,
  onClose,
  title,
  children,
  className = '',
  initialFocusRef,
  returnFocusRef,
  testID,
}: ModalProps): React.ReactNode {
  const reduceMotion = useReducedMotion();
  const { modalRef, focusInitialElement } = useModalAccessibility({
    visible,
    initialFocusRef,
    returnFocusRef,
  });
  return (
    <RNModal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={focusInitialElement}
      accessibilityViewIsModal
    >
      {/*
        Explicit flex:1 (not just the `flex-1` class) on the SafeAreaView and the
        content wrapper: react-native's built-in SafeAreaView is not registered
        with NativeWind's className interop, so `flex-1` was silently dropped and
        the ScrollView body collapsed to zero height inside the pageSheet. Using
        safe-area-context's SafeAreaView (interop'd, as elsewhere in the app) plus
        explicit styles guarantees the flex chain regardless of interop.
      */}
      <SafeAreaView
        ref={modalRef}
        testID={testID}
        style={{ flex: 1 }}
        className={`bg-page ${className}`}
        role="dialog"
        accessibilityLabel={title ?? 'Dialog'}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        {/* Handle bar */}
        <View className="items-center pt-sm pb-xs">
          <View className="w-10 h-1 rounded-full bg-divider" />
        </View>

        {/* Title row — always rendered so the X close button is always accessible */}
        <View className="flex-row items-center justify-between px-lg py-md border-b border-divider">
          <AppText className="text-lg font-bold text-default flex-1">
            {title ?? ''}
          </AppText>
          <Pressable
            onPress={onClose}
            className="min-h-touch min-w-touch items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <AppText className="text-2xl text-muted leading-none">x</AppText>
          </Pressable>
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaView>
    </RNModal>
  );
}
