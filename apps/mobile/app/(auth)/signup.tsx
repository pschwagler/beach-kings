import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input } from '@/components/ui';

export default function SignupScreen(): React.ReactNode {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signup } = useAuth();

  const handleSignup = useCallback(async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) return;
    setIsSubmitting(true);
    try {
      await signup(email.trim(), password, firstName.trim(), lastName.trim());
    } catch {
      Alert.alert('Signup Failed', 'Could not create account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [firstName, lastName, email, password, signup]);

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base justify-center px-lg">
      <View className="items-center mb-xxxl">
        <Text className="text-large-title font-bold text-primary dark:text-brand-teal">
          Create Account
        </Text>
      </View>

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
          autoComplete="new-password"
        />
        <Button
          title="Create Account"
          onPress={handleSignup}
          disabled={isSubmitting}
          loading={isSubmitting}
        />
      </View>

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
    </SafeAreaView>
  );
}
