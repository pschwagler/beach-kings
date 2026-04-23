import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button, TopNav, OtpInput } from '@/components/ui';
import { FormError } from '@/components/forms';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticSuccess, hapticError } from '@/utils/haptics';
import { otpSchema, type OtpFormValues } from '@/lib/validators';

const RESEND_COOLDOWN_SECONDS = 60;

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `••••${digits.slice(-4)}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'•'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

export default function VerifyScreen(): React.ReactNode {
  const { phone, email } = useLocalSearchParams<{
    phone?: string;
    email?: string;
  }>();
  const { verifyPhone, verifyEmail } = useAuth();
  const router = useRouter();

  const mode: 'email' | 'phone' = email ? 'email' : 'phone';

  const [countdown, setCountdown] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    mode: 'onSubmit',
    defaultValues: { code: '' },
  });

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

  const onSubmit = useCallback(
    async (values: OtpFormValues) => {
      try {
        if (mode === 'email') {
          if (!email) return;
          await verifyEmail(email, values.code);
        } else {
          if (!phone) return;
          await verifyPhone(phone, values.code);
        }
        void hapticSuccess();
      } catch {
        void hapticError();
        Alert.alert(
          'Verification Failed',
          'Invalid or expired code. Please try again.',
        );
        setShakeKey((k) => k + 1);
      }
    },
    [mode, email, phone, verifyEmail, verifyPhone],
  );

  const handleResend = useCallback(async () => {
    if (countdown > 0) return;
    if (mode === 'phone') {
      if (!phone) return;
      try {
        await api.sendVerification(phone);
        setCountdown(RESEND_COOLDOWN_SECONDS);
      } catch {
        void hapticError();
        Alert.alert('Error', 'Failed to resend code. Please try again.');
      }
      return;
    }
    // Email mode — call backend to resend the verification email
    if (!email) return;
    try {
      await api.sendEmailVerification(email);
      setCountdown(RESEND_COOLDOWN_SECONDS);
    } catch {
      void hapticError();
      Alert.alert('Error', 'Failed to resend code. Please try again.');
    }
  }, [countdown, mode, phone, email]);

  const handleUseDifferent = useCallback(() => {
    router.replace(routes.signup());
  }, [router]);

  const masked =
    mode === 'email' ? maskEmail(email ?? '') : maskPhone(phone ?? '');
  const resendDisabled = countdown > 0;
  const title = mode === 'email' ? 'Verify Email' : 'Verify Phone';
  const useDifferentLabel =
    mode === 'email' ? 'Use a different email' : 'Use a different number';
  const useDifferentA11y =
    mode === 'email'
      ? 'Use a different email address'
      : 'Use a different phone number';

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title={title} showBack />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View className="flex-1 justify-center px-lg">
        <View className="items-center mb-xl">
          <Text className="text-title2 font-bold text-primary dark:text-content-primary mb-sm">
            Enter Verification Code
          </Text>
          <Text className="text-body text-gray-500 dark:text-content-secondary text-center">
            We sent a 6-digit code to {masked}
          </Text>
        </View>

        <View className="items-center mb-md">
          <Controller
            control={control}
            name="code"
            render={({ field: { value, onChange } }) => (
              <OtpInput
                value={value}
                onChange={onChange}
                onComplete={() => {
                  void handleSubmit(onSubmit)();
                }}
                length={6}
                shakeKey={shakeKey}
              />
            )}
          />
        </View>
        <View className="items-center mb-md">
          <FormError message={errors.code?.message} />
        </View>

        <View className="gap-md">
          <Button
            title="Verify"
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            loading={isSubmitting}
          />

          <Pressable
            className="min-h-touch items-center justify-center"
            onPress={handleResend}
            disabled={resendDisabled}
            accessibilityLabel={
              resendDisabled
                ? `Resend code in ${countdown} seconds`
                : 'Resend verification code'
            }
            accessibilityRole="button"
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
            className="min-h-touch items-center justify-center"
            onPress={handleUseDifferent}
            accessibilityLabel={useDifferentA11y}
            accessibilityRole="link"
          >
            <Text className="text-footnote font-medium text-gray-500 dark:text-content-secondary">
              {useDifferentLabel}
            </Text>
          </Pressable>
        </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
