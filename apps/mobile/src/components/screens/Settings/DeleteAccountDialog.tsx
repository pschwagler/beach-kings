import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal as RNModal,
  Pressable,
  View,
} from 'react-native';

import AppText from '@/components/ui/AppText';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface DeleteAccountDialogProps {
  readonly visible: boolean;
  readonly isPending: boolean;
  readonly errorMessage?: string | null;
  readonly allowImmediateDeletion?: boolean;
  readonly onCancel: () => void;
  readonly onSchedule: () => void;
  readonly onDeleteNow?: () => void;
}

export default function DeleteAccountDialog({
  visible,
  isPending,
  errorMessage = null,
  allowImmediateDeletion = true,
  onCancel,
  onSchedule,
  onDeleteNow,
}: DeleteAccountDialogProps): React.ReactNode {
  const [confirmingImmediate, setConfirmingImmediate] = useState(false);
  const reduceMotion = useReducedMotion();
  const palette = usePaletteColors();

  useEffect(() => {
    if (!visible) setConfirmingImmediate(false);
  }, [visible]);

  useEffect(() => {
    if (visible) {
      AccessibilityInfo.announceForAccessibility(
        confirmingImmediate ? 'Permanently delete account?' : 'Delete account?',
      );
    }
  }, [confirmingImmediate, visible]);

  const close = () => {
    if (!isPending) onCancel();
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <Pressable
        testID="delete-account-dialog-backdrop"
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Dismiss delete account confirmation"
        className="flex-1 items-center justify-center bg-black/70 px-lg"
      >
        <Pressable
          testID="delete-account-dialog"
          onPress={() => {}}
          onAccessibilityEscape={close}
          accessibilityViewIsModal
          className="w-full max-w-[360px] rounded-2xl bg-surface px-xl py-xl"
        >
          <AppText accessibilityRole="header" className="text-center text-[18px] font-bold text-default">
            {confirmingImmediate ? 'Permanently delete account?' : 'Delete account?'}
          </AppText>
          <AppText className="mt-sm text-center text-[14px] leading-5 text-muted">
            {confirmingImmediate
              ? 'This permanently removes your account and personal data now. This action cannot be undone.'
              : 'Schedule deletion for a 30-day recovery window, or permanently delete your account now.'}
          </AppText>

          {errorMessage != null && (
            <AppText accessibilityRole="alert" className="mt-md text-center text-sm text-danger">
              {errorMessage}
            </AppText>
          )}

          <View className="mt-xl gap-sm">
            {confirmingImmediate ? (
              <>
                <Pressable
                  testID="delete-account-confirm-now"
                  onPress={onDeleteNow}
                  disabled={isPending}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isPending, busy: isPending }}
                  className="min-h-touch items-center justify-center rounded-xl bg-danger-fill px-lg"
                >
                  {isPending ? (
                    <ActivityIndicator color={palette.onDanger} />
                  ) : (
                    <AppText className="text-[15px] font-bold text-on-danger">Delete permanently</AppText>
                  )}
                </Pressable>
                <Pressable
                  testID="delete-account-back"
                  onPress={() => setConfirmingImmediate(false)}
                  disabled={isPending}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isPending }}
                  className="min-h-touch items-center justify-center rounded-xl border border-divider px-lg"
                >
                  <AppText className="text-[14px] font-bold text-default">Go back</AppText>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  testID="delete-account-schedule"
                  onPress={onSchedule}
                  disabled={isPending}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isPending, busy: isPending }}
                  className="min-h-touch items-center justify-center rounded-xl bg-danger-fill px-lg"
                >
                  {isPending ? (
                    <ActivityIndicator color={palette.onDanger} />
                  ) : (
                    <AppText className="text-[15px] font-bold text-on-danger">Delete in 30 days</AppText>
                  )}
                </Pressable>
                {allowImmediateDeletion && onDeleteNow != null && (
                  <Pressable
                    testID="delete-account-now"
                    onPress={() => setConfirmingImmediate(true)}
                    disabled={isPending}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isPending }}
                    className="min-h-touch items-center justify-center rounded-xl px-lg"
                  >
                    <AppText className="text-[14px] font-semibold text-danger">Delete now instead</AppText>
                  </Pressable>
                )}
                <Pressable
                  testID="delete-account-cancel"
                  onPress={close}
                  disabled={isPending}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isPending }}
                  className="min-h-touch items-center justify-center rounded-xl border border-divider px-lg"
                >
                  <AppText className="text-[14px] font-bold text-default">Cancel</AppText>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
