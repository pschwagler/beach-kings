import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Input, TopNav, OtpInput } from '@/components/ui';
import { api } from '@/lib/api';

type Step = 'phone' | 'otp' | 'newPassword';

export default function ForgotPasswordScreen(): React.ReactNode {
  const router = useRouter();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Request reset code
  const handleSendCode = useCallback(async () => {
    if (!phone.trim()) return;
    setIsSubmitting(true);
    try {
      await api.client.axiosInstance.post('/api/auth/reset-password', {
        phone_number: phone.trim(),
      });
      setStep('otp');
    } catch {
      Alert.alert('Error', 'Failed to send reset code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [phone]);

  // Step 2: Verify OTP
  const handleVerifyCode = useCallback(async () => {
    if (code.length !== 6) return;
    setIsSubmitting(true);
    try {
      const response = await api.client.axiosInstance.post(
        '/api/auth/reset-password-verify',
        { phone_number: phone.trim(), code },
      );
      setResetToken(response.data.reset_token);
      setStep('newPassword');
    } catch {
      Alert.alert(
        'Verification Failed',
        'Invalid or expired code. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [code, phone]);

  // Step 3: Set new password
  const handleResetPassword = useCallback(async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) return;
    if (newPassword !== confirmPassword) {
      Alert.alert(
        'Passwords Do Not Match',
        'Please make sure both passwords match.',
      );
      return;
    }
    setIsSubmitting(true);
    try {
      await api.client.axiosInstance.post('/api/auth/reset-password-confirm', {
        reset_token: resetToken,
        new_password: newPassword,
      });
      Alert.alert('Success', 'Your password has been reset. You are now signed in.');
    } catch {
      Alert.alert('Error', 'Failed to reset password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [newPassword, confirmPassword, resetToken]);

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Reset Password" showBack />

      <View className="flex-1 justify-center px-lg">
        {step === 'phone' && (
          <View className="gap-md">
            <Text className="text-title2 font-bold text-primary dark:text-content-primary text-center mb-sm">
              Forgot your password?
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-md">
              Enter your phone number and we'll send you a code to reset it.
            </Text>

            <View className="bg-white dark:bg-dark-surface rounded-card p-lg gap-md">
              <Input
                placeholder="Phone Number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Button
                title="Send Code"
                onPress={handleSendCode}
                disabled={isSubmitting}
                loading={isSubmitting}
              />
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
              We sent a 6-digit code to your phone.
            </Text>

            <View className="items-center mb-md">
              <OtpInput value={code} onChange={setCode} length={6} />
            </View>

            <Button
              title="Verify Code"
              onPress={handleVerifyCode}
              disabled={isSubmitting || code.length !== 6}
              loading={isSubmitting}
            />
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
              <Input
                placeholder="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoComplete="new-password"
              />
              <Input
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
              />
              <Button
                title="Reset Password"
                onPress={handleResetPassword}
                disabled={isSubmitting}
                loading={isSubmitting}
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
