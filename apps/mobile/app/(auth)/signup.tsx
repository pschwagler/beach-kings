import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input, TopNav, Divider } from '@/components/ui';

export default function SignupScreen(): React.ReactNode {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signup, loginWithGoogle, loginWithApple } = useAuth();

  const handleSignup = useCallback(async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !password.trim()) return;
    setIsSubmitting(true);
    try {
      await signup({
        phoneNumber: phone.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
      });
    } catch {
      Alert.alert('Signup Failed', 'Could not create account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [firstName, lastName, phone, email, password, signup]);

  const handleGoogleSignIn = useCallback(async () => {
    // TODO: Integrate expo-auth-session Google provider
    try {
      await loginWithGoogle('placeholder_google_token');
    } catch {
      Alert.alert('Sign Up Failed', 'Google sign-in failed. Please try again.');
    }
  }, [loginWithGoogle]);

  const handleAppleSignIn = useCallback(async () => {
    // TODO: Integrate expo-apple-authentication
    try {
      await loginWithApple('placeholder_apple_token');
    } catch {
      Alert.alert('Sign Up Failed', 'Apple sign-in failed. Please try again.');
    }
  }, [loginWithApple]);

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Create Account" showBack />

      <ScrollView
        className="flex-1 px-lg"
        contentContainerClassName="py-lg"
        keyboardShouldPersistTaps="handled"
      >
        {/* OAuth buttons at the top */}
        <View className="gap-sm mb-md">
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

        {/* OR divider */}
        <View className="flex-row items-center my-md">
          <Divider className="flex-1" />
          <Text className="mx-md text-footnote text-gray-500 dark:text-content-secondary">
            OR
          </Text>
          <Divider className="flex-1" />
        </View>

        {/* Form fields */}
        <View className="bg-white dark:bg-dark-surface rounded-card p-lg gap-md">
          <View className="flex-row gap-md">
            <Input
              className="flex-1"
              placeholder="First Name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
            />
            <Input
              className="flex-1"
              placeholder="Last Name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoComplete="family-name"
            />
          </View>
          <Input
            placeholder="Phone Number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <Input
            placeholder="Email (optional)"
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
            autoComplete="new-password"
          />
          <Text className="text-caption text-gray-400 dark:text-content-tertiary">
            Min 8 characters with a number and special character
          </Text>

          <Button
            title="Create Account"
            onPress={handleSignup}
            disabled={isSubmitting}
            loading={isSubmitting}
          />
        </View>

        {/* Legal text */}
        <Text className="text-caption text-gray-400 dark:text-content-tertiary text-center mt-md px-lg">
          By creating an account, you agree to our terms of service and privacy policy.
        </Text>

        <View className="flex-row justify-center mt-lg gap-xs">
          <Text className="text-gray-500 dark:text-content-secondary">
            Already have an account?
          </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable accessibilityLabel="Sign in to existing account" accessibilityRole="link">
              <Text className="text-primary dark:text-brand-teal font-semibold">Sign In</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
