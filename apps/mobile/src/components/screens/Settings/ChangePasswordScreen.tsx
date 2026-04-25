/**
 * ChangePasswordScreen — change password form.
 *
 * Fields:
 *   - Current Password
 *   - New Password
 *   - Confirm New Password
 *
 * Keyboard chaining via refs, KeyboardAvoidingView for scroll on small devices.
 * Wireframe ref: change-password.html
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import Input from '@/components/ui/Input';
import { hapticMedium, hapticError } from '@/utils/haptics';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormState = {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
};

type BannerState =
  | { readonly type: 'success'; readonly message: string }
  | { readonly type: 'error'; readonly message: string }
  | null;

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ChangePasswordScreen(): React.ReactNode {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [banner, setBanner] = useState<BannerState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const updateField = useCallback((field: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear banner when user starts typing
    setBanner(null);
  }, []);

  const validate = (): string | null => {
    if (form.currentPassword.length === 0) return 'Please enter your current password.';
    if (form.newPassword.length < 8) return 'New password must be at least 8 characters.';
    if (form.newPassword !== form.confirmPassword) return 'Passwords do not match.';
    if (form.newPassword === form.currentPassword) return 'New password must differ from your current password.';
    return null;
  };

  const handleSubmit = useCallback(async () => {
    const validationError = validate();
    if (validationError != null) {
      void hapticError();
      setBanner({ type: 'error', message: validationError });
      return;
    }

    void hapticMedium();
    setIsSubmitting(true);
    setBanner(null);

    try {
      await api.changePassword(form.currentPassword, form.newPassword);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setBanner({ type: 'success', message: 'Password updated successfully.' });
      // Navigate back to Settings after a brief success banner
      setTimeout(() => {
        router.back();
      }, 800);
    } catch (err: unknown) {
      void hapticError();
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setBanner({ type: 'error', message: 'Current password is incorrect.' });
      } else if (status === 400) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setBanner({ type: 'error', message: detail ?? 'Unable to change password.' });
      } else {
        setBanner({ type: 'error', message: 'Something went wrong. Please try again.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [form]);

  return (
    <SafeAreaView
      testID="change-password-screen"
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Change Password" showBack />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-lg pt-xl pb-xxxl"
        >

          {/* Banner */}
          {banner != null && (
            <View
              testID={banner.type === 'success' ? 'change-password-success' : 'change-password-error'}
              className={`mb-lg px-md py-sm rounded-xl border ${
                banner.type === 'success'
                  ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700'
                  : 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
              }`}
            >
              <Text
                className={`text-sm font-medium text-center ${
                  banner.type === 'success' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                }`}
              >
                {banner.message}
              </Text>
            </View>
          )}

          {/* Current Password */}
          <View className="mb-lg">
            <Text className="text-[13px] font-semibold text-text-muted dark:text-text-tertiary uppercase tracking-wider mb-sm">
              Current Password
            </Text>
            <Input
              testID="input-current-password"
              value={form.currentPassword}
              onChangeText={updateField('currentPassword')}
              placeholder="Enter current password"
              secureTextEntry
              showPasswordToggle
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => newPasswordRef.current?.focus()}
            />
          </View>

          {/* New Password */}
          <View className="mb-lg">
            <Text className="text-[13px] font-semibold text-text-muted dark:text-text-tertiary uppercase tracking-wider mb-sm">
              New Password
            </Text>
            <Input
              testID="input-new-password"
              ref={newPasswordRef}
              value={form.newPassword}
              onChangeText={updateField('newPassword')}
              placeholder="At least 8 characters"
              secureTextEntry
              showPasswordToggle
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            />
          </View>

          {/* Confirm New Password */}
          <View className="mb-xl">
            <Text className="text-[13px] font-semibold text-text-muted dark:text-text-tertiary uppercase tracking-wider mb-sm">
              Confirm New Password
            </Text>
            <Input
              testID="input-confirm-password"
              ref={confirmPasswordRef}
              value={form.confirmPassword}
              onChangeText={updateField('confirmPassword')}
              placeholder="Re-enter new password"
              secureTextEntry
              showPasswordToggle
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {/* Submit */}
          <Pressable
            testID="change-password-submit-btn"
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Update Password"
            className={`bg-brand-gold py-[14px] rounded-xl items-center active:opacity-80 ${
              isSubmitting ? 'opacity-50' : ''
            }`}
          >
            <Text className="text-navy font-bold text-[15px]">
              {isSubmitting ? 'Updating…' : 'Update Password'}
            </Text>
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
