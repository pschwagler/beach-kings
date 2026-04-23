import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, Platform, TextInput, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input, TopNav, Divider } from '@/components/ui';
import { FormError } from '@/components/forms';
import {
  useGoogleSignIn,
  signInWithApple,
  isAppleSignInAvailable,
  OAuthCancelledError,
  OAuthNotConfiguredError,
} from '@/lib/oauth';
import { routes } from '@/lib/navigation';
import { hapticError } from '@/utils/haptics';
import { loginSchema, type LoginFormValues } from '@/lib/validators';

export default function LoginScreen(): React.ReactNode {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const router = useRouter();

  const passwordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const handleGoogleToken = useCallback(
    async (idToken: string) => {
      try {
        await loginWithGoogle(idToken);
      } catch {
        Alert.alert('Sign In Failed', 'Google sign-in failed. Please try again.');
      }
    },
    [loginWithGoogle],
  );

  const { promptGoogle } = useGoogleSignIn(handleGoogleToken);

  const onSubmit = useCallback(
    async (values: LoginFormValues) => {
      try {
        await login({ email: values.email.trim(), password: values.password });
      } catch {
        void hapticError();
        Alert.alert('Login Failed', 'Invalid email or password. Please try again.');
      }
    },
    [login],
  );

  const handleForgotPassword = useCallback(() => {
    router.push(routes.forgotPassword());
  }, [router]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      await promptGoogle();
    } catch (err) {
      if (err instanceof OAuthCancelledError) return;
      if (err instanceof OAuthNotConfiguredError) {
        Alert.alert('Not Available', 'Google sign-in is not configured.');
        return;
      }
      Alert.alert('Sign In Failed', 'Google sign-in failed. Please try again.');
    }
  }, [promptGoogle]);

  const handleAppleSignIn = useCallback(async () => {
    try {
      const idToken = await signInWithApple();
      await loginWithApple(idToken);
    } catch (err) {
      if (err instanceof OAuthCancelledError) return;
      if (err instanceof OAuthNotConfiguredError) {
        Alert.alert('Not Available', 'Apple sign-in is only available on iOS.');
        return;
      }
      Alert.alert('Sign In Failed', 'Apple sign-in failed. Please try again.');
    }
  }, [loginWithApple]);

  const showApple = Platform.OS === 'ios' && appleAvailable;

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Log In" showBack />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center px-lg"
          keyboardShouldPersistTaps="handled"
        >
        <View className="items-center mb-xxxl">
          <Text className="text-large-title font-bold text-primary dark:text-brand-teal">
            Beach League
          </Text>
        </View>

        <View className="bg-white dark:bg-dark-surface rounded-card p-lg gap-md">
          <View>
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  placeholder="Email"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  className={
                    errors.email ? 'border-red-500 dark:border-red-500' : ''
                  }
                />
              )}
            />
            <FormError message={errors.email?.message} />
          </View>

          <View>
            <Controller
              control={control}
              name="password"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  ref={passwordRef}
                  placeholder="Password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  showPasswordToggle
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit(onSubmit)}
                  className={
                    errors.password ? 'border-red-500 dark:border-red-500' : ''
                  }
                />
              )}
            />
            <FormError message={errors.password?.message} />
          </View>

          <Pressable
            className="self-end"
            onPress={handleForgotPassword}
            accessibilityLabel="Forgot password"
            accessibilityRole="link"
          >
            <Text className="text-footnote text-primary dark:text-brand-teal font-medium">
              Forgot Password?
            </Text>
          </Pressable>

          <Button
            title="Log In"
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            loading={isSubmitting}
          />
        </View>

        <View className="flex-row items-center my-lg">
          <Divider className="flex-1" />
          <Text className="mx-md text-footnote text-gray-500 dark:text-content-secondary">
            OR
          </Text>
          <Divider className="flex-1" />
        </View>

        <View className="gap-sm">
          <Button
            title="Continue with Google"
            onPress={handleGoogleSignIn}
            variant="outline"
          />
          {showApple && (
            <Button
              title="Continue with Apple"
              onPress={handleAppleSignIn}
              variant="outline"
            />
          )}
        </View>

        <Link href={routes.signup()} asChild>
          <Pressable
            className="flex-row justify-center items-center mt-lg min-h-touch px-md py-sm"
            accessibilityLabel="Sign up for a new account"
            accessibilityRole="link"
          >
            <Text className="text-gray-500 dark:text-content-secondary">
              Don't have an account?{' '}
            </Text>
            <Text className="text-primary dark:text-brand-teal font-semibold">
              Sign Up
            </Text>
          </Pressable>
        </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
