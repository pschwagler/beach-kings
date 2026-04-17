import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input, TopNav, Divider } from '@/components/ui';

export default function LoginScreen(): React.ReactNode {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const router = useRouter();

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) return;
    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
    } catch {
      Alert.alert('Login Failed', 'Invalid email or password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, login]);

  const handleForgotPassword = useCallback(() => {
    router.push('/(auth)/forgot-password');
  }, [router]);

  const handleGoogleSignIn = useCallback(async () => {
    // TODO: Integrate expo-auth-session Google provider
    try {
      await loginWithGoogle('placeholder_google_token');
    } catch {
      Alert.alert('Sign In Failed', 'Google sign-in failed. Please try again.');
    }
  }, [loginWithGoogle]);

  const handleAppleSignIn = useCallback(async () => {
    // TODO: Integrate expo-apple-authentication
    try {
      await loginWithApple('placeholder_apple_token');
    } catch {
      Alert.alert('Sign In Failed', 'Apple sign-in failed. Please try again.');
    }
  }, [loginWithApple]);

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Sign In" showBack />

      <View className="flex-1 justify-center px-lg">
        <View className="items-center mb-xxxl">
          <Text className="text-large-title font-bold text-primary dark:text-brand-teal">
            Beach League
          </Text>
        </View>

        <View className="bg-white dark:bg-dark-surface rounded-card p-lg gap-md">
          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <Pressable
            className="self-end"
            onPress={handleForgotPassword}
            accessibilityLabel="Reset your password"
            accessibilityRole="link"
          >
            <Text className="text-footnote text-primary dark:text-brand-teal font-medium">
              Forgot Password?
            </Text>
          </Pressable>

          <Button
            title="Sign In"
            onPress={handleLogin}
            disabled={isSubmitting}
            loading={isSubmitting}
          />
        </View>

        {/* OR divider */}
        <View className="flex-row items-center my-lg">
          <Divider className="flex-1" />
          <Text className="mx-md text-footnote text-gray-500 dark:text-content-secondary">
            OR
          </Text>
          <Divider className="flex-1" />
        </View>

        {/* OAuth buttons */}
        <View className="gap-sm">
          <Button
            title="Continue with Google"
            onPress={handleGoogleSignIn}
            variant="outline"
          />
          <Button
            title="Continue with Apple"
            onPress={handleAppleSignIn}
            variant="outline"
          />
        </View>

        <View className="flex-row justify-center mt-lg gap-xs">
          <Text className="text-gray-500 dark:text-content-secondary">
            Don't have an account?
          </Text>
          <Link href="/(auth)/signup" asChild>
            <Pressable accessibilityLabel="Sign up for a new account" accessibilityRole="link">
              <Text className="text-primary dark:text-brand-teal font-semibold">Sign Up</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
