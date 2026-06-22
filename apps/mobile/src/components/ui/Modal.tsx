/**
 * Modal component — full-screen modal with slide-up animation.
 * Handle bar at top, optional title row, X close button.
 */

import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export default function Modal({
  visible,
  onClose,
  title,
  children,
  className = '',
}: ModalProps): React.ReactNode {
  return (
    <RNModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/*
        Explicit flex:1 (not just the `flex-1` class) on the SafeAreaView and the
        content wrapper: react-native's built-in SafeAreaView is not registered
        with NativeWind's className interop, so `flex-1` was silently dropped and
        the ScrollView body collapsed to zero height inside the pageSheet. Using
        safe-area-context's SafeAreaView (interop'd, as elsewhere in the app) plus
        explicit styles guarantees the flex chain regardless of interop.
      */}
      <SafeAreaView style={{ flex: 1 }} className={`bg-page ${className}`}>
        {/* Handle bar */}
        <View className="items-center pt-sm pb-xs">
          {/* eslint-disable-next-line no-restricted-syntax -- drag handle: no semantic token for this gray pair */}
          <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </View>

        {/* Title row — always rendered so the X close button is always accessible */}
        <View className="flex-row items-center justify-between px-lg py-md border-b border-divider">
          <Text className="text-lg font-bold text-default flex-1">
            {title ?? ''}
          </Text>
          <Pressable
            onPress={onClose}
            className="min-h-touch min-w-touch items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text className="text-2xl text-muted leading-none">
              x
            </Text>
          </Pressable>
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          {children}
        </View>
      </SafeAreaView>
    </RNModal>
  );
}
