/**
 * AddPhoneScreen — one-time flow to attach a phone number to an account that
 * currently has none. Two steps:
 *   1. `input`  — collect the phone number, trigger OTP via /phone/add/request
 *   2. `verify` — submit the 6-digit code via /phone/add/verify, then refresh
 *                 the signed-in user and navigate back.
 *
 * Phone *changes* are not supported here — the AccountSettingsScreen routes
 * those to a support mailto instead.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import TopNav from '@/components/ui/TopNav';
import Input from '@/components/ui/Input';
import OtpInput from '@/components/ui/OtpInput';
import { FormError } from '@/components/forms';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  hapticError,
  hapticLight,
  hapticMedium,
  hapticSuccess,
} from '@/utils/haptics';
import {
  otpSchema,
  phoneSchema,
  type OtpFormValues,
} from '@/lib/validators';
import { z } from 'zod';

const RESEND_COOLDOWN_SECONDS = 60;

const phoneFormSchema = z.object({
  phoneNumber: phoneSchema,
});

type PhoneFormValues = z.infer<typeof phoneFormSchema>;

type Step = 'input' | 'verify';

type BannerState =
  | { readonly type: 'error'; readonly message: string }
  | null;

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `••••${digits.slice(-4)}`;
}

export default function AddPhoneScreen(): React.ReactNode {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [step, setStep] = useState<Step>('input');
  const [phone, setPhone] = useState<string>('');
  const [banner, setBanner] = useState<BannerState>(null);
  const [countdown, setCountdown] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phone input form
  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneFormSchema),
    mode: 'onSubmit',
    defaultValues: { phoneNumber: '' },
  });

  // OTP form
  const otpForm = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    mode: 'onSubmit',
    defaultValues: { code: '' },
  });

  // Resend countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [countdown]);

  const onSubmitPhone = useCallback(
    async (values: PhoneFormValues) => {
      setBanner(null);
      try {
        await api.requestAddPhone(values.phoneNumber);
        void hapticMedium();
        setPhone(values.phoneNumber);
        setCountdown(RESEND_COOLDOWN_SECONDS);
        otpForm.reset({ code: '' });
        setStep('verify');
      } catch (err: unknown) {
        void hapticError();
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 409) {
          setBanner({
            type: 'error',
            message: 'That number is already in use.',
          });
          return;
        }
        if (status === 422) {
          setBanner({
            type: 'error',
            message: 'Please enter a valid US phone number.',
          });
          return;
        }
        if (status === 502) {
          setBanner({
            type: 'error',
            message: 'Unable to send SMS. Try again shortly.',
          });
          return;
        }
        setBanner({
          type: 'error',
          message: 'Something went wrong. Please try again.',
        });
      }
    },
    [otpForm],
  );

  const onSubmitOtp = useCallback(
    async (values: OtpFormValues) => {
      setBanner(null);
      try {
        await api.verifyAddPhone(phone, values.code);
        void hapticSuccess();
        await refreshUser();
        router.back();
      } catch (err: unknown) {
        void hapticError();
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        setShakeKey((k) => k + 1);
        otpForm.reset({ code: '' });
        if (status === 400) {
          setBanner({
            type: 'error',
            message: 'Invalid or expired code. Please try again.',
          });
          return;
        }
        if (status === 409) {
          setBanner({
            type: 'error',
            message: 'That number was just claimed by another account.',
          });
          return;
        }
        setBanner({
          type: 'error',
          message: 'Something went wrong. Please try again.',
        });
      }
    },
    [phone, refreshUser, router, otpForm],
  );

  const handleResend = useCallback(async () => {
    if (countdown > 0 || phone.length === 0) return;
    setBanner(null);
    try {
      await api.requestAddPhone(phone);
      void hapticLight();
      setCountdown(RESEND_COOLDOWN_SECONDS);
    } catch {
      void hapticError();
      setBanner({
        type: 'error',
        message: 'Failed to resend code. Please try again.',
      });
    }
  }, [countdown, phone]);

  const handleBackToInput = useCallback(() => {
    void hapticLight();
    setStep('input');
    setBanner(null);
    otpForm.reset({ code: '' });
  }, [otpForm]);

  const resendDisabled = countdown > 0;

  return (
    <SafeAreaView
      testID="add-phone-screen"
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Add Phone Number" showBack />

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
          {banner != null && (
            <View
              testID="add-phone-banner"
              className="mb-lg px-md py-sm rounded-xl border bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700"
            >
              <Text className="text-sm font-medium text-center text-red-700 dark:text-red-400">
                {banner.message}
              </Text>
            </View>
          )}

          {step === 'input' ? (
            <View>
              <Text className="text-body text-text-muted dark:text-content-secondary mb-lg">
                We'll send a 6-digit code to verify the number.
              </Text>

              <Text className="text-[13px] font-semibold text-text-muted dark:text-text-tertiary uppercase tracking-wider mb-sm">
                Phone Number
              </Text>
              <Controller
                control={phoneForm.control}
                name="phoneNumber"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    testID="input-phone-number"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="+1 555 123 4567"
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    returnKeyType="done"
                    onSubmitEditing={phoneForm.handleSubmit(onSubmitPhone)}
                  />
                )}
              />
              <View className="mt-sm">
                <FormError message={phoneForm.formState.errors.phoneNumber?.message} />
              </View>

              <Pressable
                testID="add-phone-send-btn"
                onPress={phoneForm.handleSubmit(onSubmitPhone)}
                disabled={phoneForm.formState.isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Send code"
                className={`mt-xl bg-brand-gold py-[14px] rounded-xl items-center active:opacity-80 ${
                  phoneForm.formState.isSubmitting ? 'opacity-50' : ''
                }`}
              >
                <Text className="text-navy font-bold text-[15px]">
                  {phoneForm.formState.isSubmitting ? 'Sending…' : 'Send code'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text className="text-body text-text-muted dark:text-content-secondary text-center mb-lg">
                We sent a 6-digit code to{' '}
                <Text className="font-semibold text-text-default dark:text-content-primary">
                  {maskPhone(phone)}
                </Text>
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
                      shakeKey={shakeKey}
                    />
                  )}
                />
              </View>
              <View className="items-center mb-md">
                <FormError message={otpForm.formState.errors.code?.message} />
              </View>

              <Pressable
                testID="add-phone-verify-btn"
                onPress={otpForm.handleSubmit(onSubmitOtp)}
                disabled={otpForm.formState.isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Verify"
                className={`bg-brand-gold py-[14px] rounded-xl items-center active:opacity-80 ${
                  otpForm.formState.isSubmitting ? 'opacity-50' : ''
                }`}
              >
                <Text className="text-navy font-bold text-[15px]">
                  {otpForm.formState.isSubmitting ? 'Verifying…' : 'Verify'}
                </Text>
              </Pressable>

              <Pressable
                testID="add-phone-resend-btn"
                onPress={handleResend}
                disabled={resendDisabled}
                accessibilityRole="button"
                accessibilityLabel={
                  resendDisabled
                    ? `Resend code in ${countdown} seconds`
                    : 'Resend verification code'
                }
                className="min-h-touch items-center justify-center mt-md"
              >
                <Text
                  className={`text-footnote font-medium ${
                    resendDisabled
                      ? 'text-gray-400 dark:text-content-tertiary'
                      : 'text-primary dark:text-brand-teal'
                  }`}
                >
                  {resendDisabled
                    ? `Resend code in ${countdown}s`
                    : "Didn't receive a code? Resend"}
                </Text>
              </Pressable>

              <Pressable
                testID="add-phone-change-number-btn"
                onPress={handleBackToInput}
                accessibilityRole="button"
                accessibilityLabel="Use a different number"
                className="min-h-touch items-center justify-center"
              >
                <Text className="text-footnote font-medium text-gray-500 dark:text-content-secondary">
                  Use a different number
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
