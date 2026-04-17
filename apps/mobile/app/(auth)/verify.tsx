import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button, TopNav, OtpInput } from '@/components/ui';
import { api } from '@/lib/api';

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Mask a phone number for display: show only last 4 digits.
 * e.g. "+12025551234" → "••••1234"
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `••••${digits.slice(-4)}`;
}

export default function VerifyScreen(): React.ReactNode {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyPhone } = useAuth();

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer for resend cooldown
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
  }, [countdown > 0]);

  const handleVerify = useCallback(async () => {
    if (code.length !== 6 || !phone) return;
    setIsSubmitting(true);
    try {
      await verifyPhone(phone, code);
    } catch {
      Alert.alert(
        'Verification Failed',
        'Invalid or expired code. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [code, phone, verifyPhone]);

  const handleResend = useCallback(async () => {
    if (countdown > 0 || !phone) return;
    try {
      await api.client.axiosInstance.post('/api/auth/send-verification', {
        phone_number: phone,
      });
      setCountdown(RESEND_COOLDOWN_SECONDS);
    } catch {
      Alert.alert('Error', 'Failed to resend code. Please try again.');
    }
  }, [countdown, phone]);

  const maskedPhone = maskPhone(phone ?? '');
  const resendDisabled = countdown > 0;

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Verify Phone" showBack />

      <View className="flex-1 justify-center px-lg">
        <View className="items-center mb-xl">
          <Text className="text-title2 font-bold text-primary dark:text-content-primary mb-sm">
            Enter Verification Code
          </Text>
          <Text className="text-body text-gray-500 dark:text-content-secondary text-center">
            We sent a 6-digit code to {maskedPhone}
          </Text>
        </View>

        <View className="items-center mb-xl">
          <OtpInput value={code} onChange={setCode} length={6} />
        </View>

        <View className="gap-md">
          <Button
            title="Verify"
            onPress={handleVerify}
            disabled={isSubmitting || code.length !== 6}
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
        </View>
      </View>
    </SafeAreaView>
  );
}
