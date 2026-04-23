import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, TopNav, OtpInput } from '@/components/ui';
import { CheckIcon } from '@/components/ui/icons';
import { FormError } from '@/components/forms';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticSuccess, hapticError } from '@/utils/haptics';
import {
  otpSchema,
  resetPasswordRequestSchema,
  resetPasswordEmailRequestSchema,
  setNewPasswordSchema,
  type OtpFormValues,
  type ResetPasswordRequestFormValues,
  type ResetPasswordEmailRequestFormValues,
  type SetNewPasswordFormValues,
} from '@/lib/validators';

type Step = 'request' | 'otp' | 'newPassword' | 'success';
type Method = 'email' | 'phone';

export default function ForgotPasswordScreen(): React.ReactNode {
  const router = useRouter();

  const confirmPasswordRef = useRef<TextInput>(null);

  const [method, setMethod] = useState<Method>('email');
  const [step, setStep] = useState<Step>('request');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [otpShakeKey, setOtpShakeKey] = useState(0);
  const [resendCountdown, setResendCountdown] = useState(0);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const emailForm = useForm<ResetPasswordEmailRequestFormValues>({
    resolver: zodResolver(resetPasswordEmailRequestSchema),
    mode: 'onSubmit',
    defaultValues: { email: '' },
  });

  const phoneForm = useForm<ResetPasswordRequestFormValues>({
    resolver: zodResolver(resetPasswordRequestSchema),
    mode: 'onSubmit',
    defaultValues: { phoneNumber: '' },
  });

  const otpForm = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    mode: 'onSubmit',
    defaultValues: { code: '' },
  });

  const passwordForm = useForm<SetNewPasswordFormValues>({
    resolver: zodResolver(setNewPasswordSchema),
    mode: 'onSubmit',
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmitEmail = useCallback(
    async (values: ResetPasswordEmailRequestFormValues) => {
      const trimmed = values.email.trim();
      try {
        await api.resetPasswordEmail(trimmed);
        setEmail(trimmed);
        setStep('otp');
      } catch {
        void hapticError();
        Alert.alert('Error', 'Failed to send reset code. Please try again.');
      }
    },
    [],
  );

  const onSubmitPhone = useCallback(
    async (values: ResetPasswordRequestFormValues) => {
      try {
        await api.resetPassword(values.phoneNumber);
        setPhone(values.phoneNumber);
        setStep('otp');
      } catch {
        void hapticError();
        Alert.alert('Error', 'Failed to send reset code. Please try again.');
      }
    },
    [],
  );

  useEffect(() => {
    if (resendCountdown <= 0) {
      if (resendTimerRef.current) {
        clearInterval(resendTimerRef.current);
        resendTimerRef.current = null;
      }
      return;
    }
    resendTimerRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          resendTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, [resendCountdown]);

  const RESEND_COOLDOWN_SECONDS = 60;

  const handleResendCode = useCallback(async () => {
    if (resendCountdown > 0) return;
    try {
      if (method === 'email') {
        await api.resetPasswordEmail(email);
      } else {
        await api.resetPassword(phone);
      }
      setResendCountdown(RESEND_COOLDOWN_SECONDS);
    } catch {
      void hapticError();
      Alert.alert('Error', 'Failed to resend code. Please try again.');
    }
  }, [resendCountdown, method, email, phone]);

  const onSubmitOtp = useCallback(
    async (values: OtpFormValues) => {
      try {
        const data =
          method === 'email'
            ? await api.resetPasswordEmailVerify(email, values.code)
            : await api.resetPasswordVerify(phone, values.code);
        setResetToken(data.reset_token);
        setStep('newPassword');
      } catch {
        void hapticError();
        Alert.alert(
          'Verification Failed',
          'Invalid or expired code. Please try again.',
        );
        setOtpShakeKey((k) => k + 1);
      }
    },
    [method, email, phone],
  );

  const onSubmitNewPassword = useCallback(
    async (values: SetNewPasswordFormValues) => {
      try {
        await api.resetPasswordConfirm(resetToken, values.newPassword);
        void hapticSuccess();
        setStep('success');
      } catch {
        void hapticError();
        Alert.alert('Error', 'Failed to reset password. Please try again.');
      }
    },
    [resetToken],
  );

  const handleContinueToLogin = useCallback(() => {
    router.replace(routes.login());
  }, [router]);

  const otpSubtitle =
    method === 'email'
      ? 'We sent a 6-digit code to your email.'
      : 'We sent a 6-digit code to your phone.';

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Reset Password" showBack />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow justify-center px-lg"
        keyboardShouldPersistTaps="handled"
      >
        {step === 'request' && (
          <View className="gap-md">
            <Text className="text-title2 font-bold text-primary dark:text-content-primary text-center mb-sm">
              Forgot your password?
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-md">
              {method === 'email'
                ? "Enter your email and we'll send you a code to reset it."
                : "Enter your phone number and we'll send you a code to reset it."}
            </Text>

            <View className="flex-row bg-white dark:bg-dark-surface rounded-card p-xs">
              <Pressable
                onPress={() => setMethod('email')}
                accessibilityRole="button"
                accessibilityLabel="Use email to reset password"
                accessibilityState={{ selected: method === 'email' }}
                className={`flex-1 py-sm rounded-card items-center justify-center ${
                  method === 'email'
                    ? 'bg-primary dark:bg-brand-teal'
                    : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-footnote font-medium ${
                    method === 'email'
                      ? 'text-white'
                      : 'text-gray-500 dark:text-content-secondary'
                  }`}
                >
                  Email
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMethod('phone')}
                accessibilityRole="button"
                accessibilityLabel="Use phone number to reset password"
                accessibilityState={{ selected: method === 'phone' }}
                className={`flex-1 py-sm rounded-card items-center justify-center ${
                  method === 'phone'
                    ? 'bg-primary dark:bg-brand-teal'
                    : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-footnote font-medium ${
                    method === 'phone'
                      ? 'text-white'
                      : 'text-gray-500 dark:text-content-secondary'
                  }`}
                >
                  Phone
                </Text>
              </Pressable>
            </View>

            <View className="bg-white dark:bg-dark-surface rounded-card p-lg gap-md">
              <View style={method === 'email' ? undefined : { display: 'none' }}>
                <Controller
                  control={emailForm.control}
                  name="email"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      placeholder="Email"
                      value={value ?? ''}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                      returnKeyType="go"
                      onSubmitEditing={emailForm.handleSubmit(onSubmitEmail)}
                      className={
                        emailForm.formState.errors.email
                          ? 'border-red-500 dark:border-red-500'
                          : ''
                      }
                    />
                  )}
                />
                <FormError
                  message={emailForm.formState.errors.email?.message}
                />
              </View>
              <View style={method === 'phone' ? undefined : { display: 'none' }}>
                <Controller
                  control={phoneForm.control}
                  name="phoneNumber"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      placeholder="Phone Number"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                      returnKeyType="go"
                      onSubmitEditing={phoneForm.handleSubmit(onSubmitPhone)}
                      className={
                        phoneForm.formState.errors.phoneNumber
                          ? 'border-red-500 dark:border-red-500'
                          : ''
                      }
                    />
                  )}
                />
                <FormError
                  message={phoneForm.formState.errors.phoneNumber?.message}
                />
              </View>
              {method === 'email' ? (
                <Button
                  title="Send Code"
                  onPress={emailForm.handleSubmit(onSubmitEmail)}
                  disabled={emailForm.formState.isSubmitting}
                  loading={emailForm.formState.isSubmitting}
                />
              ) : (
                <Button
                  title="Send Code"
                  onPress={phoneForm.handleSubmit(onSubmitPhone)}
                  disabled={phoneForm.formState.isSubmitting}
                  loading={phoneForm.formState.isSubmitting}
                />
              )}
            </View>

            <Pressable
              className="min-h-touch items-center justify-center mt-md"
              onPress={() => router.back()}
              accessibilityLabel="Go back to sign in"
              accessibilityRole="link"
            >
              <Text className="text-footnote text-primary dark:text-brand-teal font-medium">
                Back to Sign In
              </Text>
            </Pressable>
          </View>
        )}

        {step === 'otp' && (
          <View className="gap-md">
            <Text className="text-title2 font-bold text-primary dark:text-content-primary text-center mb-sm">
              Enter Verification Code
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-md">
              {otpSubtitle}
            </Text>

            <View className="items-center mb-md">
              <Controller
                control={otpForm.control}
                name="code"
                render={({ field: { value, onChange } }) => (
                  <OtpInput
                    value={value}
                    onChange={onChange}
                    onComplete={() => {
                      void otpForm.handleSubmit(onSubmitOtp)();
                    }}
                    length={6}
                    shakeKey={otpShakeKey}
                  />
                )}
              />
            </View>
            <FormError message={otpForm.formState.errors.code?.message} />

            <Button
              title="Verify Code"
              onPress={otpForm.handleSubmit(onSubmitOtp)}
              disabled={otpForm.formState.isSubmitting}
              loading={otpForm.formState.isSubmitting}
            />

            <Pressable
              className="min-h-touch items-center justify-center"
              onPress={handleResendCode}
              disabled={resendCountdown > 0}
              accessibilityLabel={
                resendCountdown > 0
                  ? `Resend code in ${resendCountdown} seconds`
                  : 'Resend verification code'
              }
              accessibilityRole="button"
            >
              <Text
                className={`text-footnote font-medium ${
                  resendCountdown > 0
                    ? 'text-gray-400 dark:text-content-tertiary'
                    : 'text-primary dark:text-brand-teal'
                }`}
              >
                {resendCountdown > 0
                  ? `Resend code in ${resendCountdown}s`
                  : "Didn't receive a code? Resend"}
              </Text>
            </Pressable>
          </View>
        )}

        {step === 'newPassword' && (
          <View className="gap-md">
            <Text className="text-title2 font-bold text-primary dark:text-content-primary text-center mb-sm">
              Set New Password
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-md">
              Choose a strong password with at least 8 characters.
            </Text>

            <View className="bg-white dark:bg-dark-surface rounded-card p-lg gap-md">
              <View>
                <Controller
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      placeholder="New Password"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry
                      showPasswordToggle
                      autoComplete="password-new"
                      textContentType="newPassword"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                      className={
                        passwordForm.formState.errors.newPassword
                          ? 'border-red-500 dark:border-red-500'
                          : ''
                      }
                    />
                  )}
                />
                <FormError
                  message={passwordForm.formState.errors.newPassword?.message}
                />
              </View>
              <View>
                <Controller
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      ref={confirmPasswordRef}
                      placeholder="Confirm Password"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry
                      showPasswordToggle
                      autoComplete="password-new"
                      textContentType="newPassword"
                      returnKeyType="go"
                      onSubmitEditing={passwordForm.handleSubmit(onSubmitNewPassword)}
                      className={
                        passwordForm.formState.errors.confirmPassword
                          ? 'border-red-500 dark:border-red-500'
                          : ''
                      }
                    />
                  )}
                />
                <FormError
                  message={
                    passwordForm.formState.errors.confirmPassword?.message
                  }
                />
              </View>
              <Button
                title="Reset Password"
                onPress={passwordForm.handleSubmit(onSubmitNewPassword)}
                disabled={passwordForm.formState.isSubmitting}
                loading={passwordForm.formState.isSubmitting}
              />
            </View>
          </View>
        )}

        {step === 'success' && (
          <View className="items-center gap-md">
            <View className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 items-center justify-center mb-md">
              <CheckIcon size={48} color="#15803d" />
            </View>
            <Text className="text-title2 font-bold text-green-700 dark:text-green-400 text-center">
              Password Reset!
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-md">
              Your password has been updated. You can now sign in with your new password.
            </Text>
            <View className="w-full">
              <Button
                title="Continue to Login"
                onPress={handleContinueToLogin}
              />
            </View>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
