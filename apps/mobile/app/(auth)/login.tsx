import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input } from '@/components/ui';

export default function LoginScreen(): React.ReactNode {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) return;
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch {
      Alert.alert('Login Failed', 'Invalid email or password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, login]);

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base justify-center px-lg">
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
        <Button
          title="Sign In"
          onPress={handleLogin}
          disabled={isSubmitting}
          loading={isSubmitting}
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
    </SafeAreaView>
  );
}
