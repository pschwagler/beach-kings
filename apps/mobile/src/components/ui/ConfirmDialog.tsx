/**
 * ConfirmDialog — reusable centered confirm modal.
 *
 * Used for discard-on-close prompts and destructive actions (delete, etc.).
 * Backdrop tap and hardware-back both invoke `onCancel`.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Modal as RNModal, View, Pressable } from 'react-native';
import AppText from './AppText';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePaletteColors } from '@/theme/usePaletteColors';
import {
  type AccessibilityFocusRef,
  useModalAccessibility,
} from './useModalAccessibility';

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
  readonly returnFocusRef?: AccessibilityFocusRef;
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
  returnFocusRef,
}: ConfirmDialogProps): React.ReactNode {
  const reduceMotion = useReducedMotion();
  const palette = usePaletteColors();
  const confirmBg =
    confirmVariant === 'destructive' ? 'bg-danger-fill' : 'bg-brand-gold';
  const confirmText =
    confirmVariant === 'destructive' ? 'text-on-danger' : 'text-on-brand-gold';

  const activationPendingRef = useRef(false);
  const titleRef = useRef<View>(null);
  const { modalRef, focusInitialElement, restoreFocusAfterDismissal } = useModalAccessibility({
    visible,
    initialFocusRef: titleRef,
    returnFocusRef,
  });

  useEffect(() => {
    if (!visible || !isPending) activationPendingRef.current = false;
  }, [isPending, visible]);

  const confirmOnce = useCallback(() => {
    if (isPending || activationPendingRef.current) return;
    activationPendingRef.current = true;
    onConfirm();
  }, [isPending, onConfirm]);

  return (
    <RNModal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={isPending ? () => {} : onCancel}
      onShow={focusInitialElement}
      onDismiss={restoreFocusAfterDismissal}
      accessibilityViewIsModal
    >
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          testID={
            testID != null ? `${testID}-backdrop` : 'confirm-dialog-backdrop'
          }
          onPress={isPending ? undefined : onCancel}
          accessible={false}
          importantForAccessibility="no"
          className="absolute inset-0 bg-black/70"
        />
        <View
          ref={modalRef}
          testID={testID ?? 'confirm-dialog'}
          onAccessibilityEscape={isPending ? undefined : onCancel}
          role="dialog"
          accessibilityLabel={title}
          accessibilityViewIsModal
          className="w-full max-w-[360px] bg-surface rounded-2xl px-5 py-5"
        >
          <View
            ref={titleRef}
            accessible
            accessibilityRole="header"
            accessibilityLabel={title}
          >
            <AppText accessible={false} className="text-[17px] font-bold text-default text-center">
              {title}
            </AppText>
          </View>
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
              onPress={confirmOnce}
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
        </View>
      </View>
    </RNModal>
  );
}
