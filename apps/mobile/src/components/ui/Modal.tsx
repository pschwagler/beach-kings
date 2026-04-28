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
  SafeAreaView,
} from 'react-native';

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
      <SafeAreaView className={`flex-1 bg-page ${className}`}>
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
        <View className="flex-1">
          {children}
        </View>
      </SafeAreaView>
    </RNModal>
  );
}
