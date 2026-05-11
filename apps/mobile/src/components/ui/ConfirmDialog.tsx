/**
 * ConfirmDialog — reusable centered confirm modal.
 *
 * Used for discard-on-close prompts and destructive actions (delete, etc.).
 * Backdrop tap and hardware-back both invoke `onCancel`.
 */

import React from 'react';
import { Modal as RNModal, View, Text, Pressable } from 'react-native';

export type ConfirmDialogVariant = 'destructive' | 'primary';

export interface ConfirmDialogProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly confirmVariant?: ConfirmDialogVariant;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly testID?: string;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  cancelLabel,
  onConfirm,
  onCancel,
  testID,
}: ConfirmDialogProps): React.ReactNode {
  const confirmBg =
    confirmVariant === 'destructive' ? 'bg-danger' : 'bg-brand-gold';

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        testID={testID != null ? `${testID}-backdrop` : 'confirm-dialog-backdrop'}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="flex-1 bg-black/70 items-center justify-center px-6"
      >
        {/* Inner pressable swallows taps so the dialog body doesn't dismiss. */}
        <Pressable
          testID={testID ?? 'confirm-dialog'}
          onPress={() => {}}
          className="w-full max-w-[360px] bg-surface rounded-2xl px-5 py-5"
        >
          <Text className="text-[17px] font-bold text-default text-center">
            {title}
          </Text>
          <Text className="text-[14px] text-muted text-center leading-[1.45] mt-2">
            {message}
          </Text>

          <View className="mt-5 gap-2">
            <Pressable
              testID={
                testID != null ? `${testID}-confirm` : 'confirm-dialog-confirm'
              }
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              className={`w-full py-[14px] rounded-[12px] items-center ${confirmBg}`}
            >
              <Text className="text-white font-bold text-[15px]">
                {confirmLabel}
              </Text>
            </Pressable>

            <Pressable
              testID={
                testID != null ? `${testID}-cancel` : 'confirm-dialog-cancel'
              }
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              className="w-full py-[14px] rounded-[12px] border border-divider items-center"
            >
              <Text className="text-[14px] font-bold text-muted">
                {cancelLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
