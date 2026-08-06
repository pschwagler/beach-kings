/**
 * ConfirmDialog — reusable centered confirm modal.
 *
 * Used for discard-on-close prompts and destructive actions (delete, etc.).
 * Backdrop tap and hardware-back both invoke `onCancel`.
 */

import React, { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal as RNModal, View, Pressable } from 'react-native';
import AppText from './AppText';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
  readonly isPending?: boolean;
  readonly errorMessage?: string | null;
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
  isPending = false,
  errorMessage = null,
  testID,
}: ConfirmDialogProps): React.ReactNode {
  const reduceMotion = useReducedMotion();
  const palette = usePaletteColors();
  const confirmBg =
    confirmVariant === 'destructive' ? 'bg-danger-fill' : 'bg-brand-gold';
  const confirmText =
    confirmVariant === 'destructive' ? 'text-on-danger' : 'text-on-brand-gold';

  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(title);
  }, [title, visible]);

  return (
    <RNModal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={isPending ? () => {} : onCancel}
      accessibilityViewIsModal
    >
      <Pressable
        testID={
          testID != null ? `${testID}-backdrop` : 'confirm-dialog-backdrop'
        }
        onPress={isPending ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="flex-1 bg-black/70 items-center justify-center px-6"
      >
        {/* Inner pressable swallows taps so the dialog body doesn't dismiss. */}
        <Pressable
          testID={testID ?? 'confirm-dialog'}
          onPress={() => {}}
          onAccessibilityEscape={isPending ? undefined : onCancel}
          accessibilityViewIsModal
          className="w-full max-w-[360px] bg-surface rounded-2xl px-5 py-5"
        >
          <AppText className="text-[17px] font-bold text-default text-center">
            {title}
          </AppText>
          <AppText className="text-[14px] text-muted text-center leading-[1.45] mt-2">
            {message}
          </AppText>
          {errorMessage != null && (
            <AppText accessibilityRole="alert" className="text-sm text-danger text-center mt-sm">
              {errorMessage}
            </AppText>
          )}

          <View className="mt-5 gap-2">
            <Pressable
              testID={
                testID != null ? `${testID}-confirm` : 'confirm-dialog-confirm'
              }
              onPress={onConfirm}
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ disabled: isPending, busy: isPending }}
              className={`w-full min-h-touch rounded-[12px] items-center justify-center ${confirmBg}`}
            >
              {isPending ? (
                <ActivityIndicator color={palette.textDefault} />
              ) : (
                <AppText className={`${confirmText} font-bold text-[15px]`}>
                  {confirmLabel}
                </AppText>
              )}
            </Pressable>

            <Pressable
              testID={
                testID != null ? `${testID}-cancel` : 'confirm-dialog-cancel'
              }
              onPress={isPending ? undefined : onCancel}
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              accessibilityState={{ disabled: isPending }}
              className="w-full min-h-touch rounded-[12px] border border-divider items-center justify-center"
            >
              <AppText className="text-[14px] font-bold text-muted">
                {cancelLabel}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
