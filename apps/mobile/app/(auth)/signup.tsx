import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView, Platform, Linking, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
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
import { signupSchema, type SignupFormValues } from '@/lib/validators';

export default function SignupScreen(): React.ReactNode {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const { signup, loginWithGoogle, loginWithApple } = useAuth();
  const router = useRouter();

  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onSubmit',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const handleGoogleToken = useCallback(
    async (idToken: string) => {
      try {
        await loginWithGoogle(idToken);
      } catch {
        void hapticError();
        Alert.alert('Sign Up Failed', 'Google sign-in failed. Please try again.');
      }
    },
    [loginWithGoogle],
  );

  const { promptGoogle } = useGoogleSignIn(handleGoogleToken);

  const onSubmit = useCallback(
    async (values: SignupFormValues) => {
      const email = values.email.trim();
      try {
        await signup({
          email,
          password: values.password,
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
        });
        router.push({ pathname: routes.verify(), params: { email } });
      } catch {
        void hapticError();
        Alert.alert('Signup Failed', 'Could not create account. Please try again.');
      }
    },
    [signup, router],
  );

  const handleGoogleSignIn = useCallback(async () => {
    try {
      await promptGoogle();
    } catch (err) {
      if (err instanceof OAuthCancelledError) return;
      if (err instanceof OAuthNotConfiguredError) {
        Alert.alert('Not Available', 'Google sign-in is not configured.');
        return;
      }
      void hapticError();
      Alert.alert('Sign Up Failed', 'Google sign-in failed. Please try again.');
    }
  }, [promptGoogle]);

  const handleTos = useCallback(() => {
    void Linking.openURL('https://beachleague.app/terms');
  }, []);

  const handlePrivacy = useCallback(() => {
    void Linking.openURL('https://beachleague.app/privacy');
  }, []);

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
      void hapticError();
      Alert.alert('Sign Up Failed', 'Apple sign-in failed. Please try again.');
    }
  }, [loginWithApple]);

  const showApple = Platform.OS === 'ios' && appleAvailable;

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Create Account" showBack />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        className="flex-1 px-lg"
        contentContainerClassName="py-lg"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-sm mb-md">
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

        <View className="flex-row items-center my-md">
          <Divider className="flex-1" />
          <Text className="mx-md text-footnote text-gray-500 dark:text-content-secondary">
            OR
          </Text>
          <Divider className="flex-1" />
        </View>

        <View className="bg-white dark:bg-dark-surface rounded-card p-lg gap-md">
          <View className="flex-row gap-md">
            <View className="flex-1">
              <Controller
                control={control}
                name="firstName"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    placeholder="First Name"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="words"
                    autoComplete="given-name"
                    textContentType="givenName"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                    className={
                      errors.firstName ? 'border-red-500 dark:border-red-500' : ''
                    }
                  />
                )}
              />
              <FormError message={errors.firstName?.message} />
            </View>
            <View className="flex-1">
              <Controller
                control={control}
                name="lastName"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    ref={lastNameRef}
                    placeholder="Last Name"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="words"
                    autoComplete="family-name"
                    textContentType="familyName"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => emailRef.current?.focus()}
                    className={
                      errors.lastName ? 'border-red-500 dark:border-red-500' : ''
                    }
                  />
                )}
              />
              <FormError message={errors.lastName?.message} />
            </View>
          </View>

          <View>
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  ref={emailRef}
                  placeholder="Email"
                  value={value ?? ''}
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
                  autoComplete="password-new"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit(onSubmit)}
                  className={
                    errors.password ? 'border-red-500 dark:border-red-500' : ''
                  }
                />
              )}
            />
            {errors.password ? (
              <FormError message={errors.password.message} />
            ) : (
              <Text className="text-caption text-gray-400 dark:text-content-tertiary mt-xxs">
                At least 8 characters.
              </Text>
            )}
          </View>

          <Button
            title="Create Account"
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            loading={isSubmitting}
          />
        </View>

        <View className="items-center mt-md px-lg">
          <Text className="text-caption text-gray-400 dark:text-content-tertiary text-center">
            By creating an account, you agree to our
          </Text>
          <View className="flex-row gap-xs mt-xxs">
            <Pressable onPress={handleTos} accessibilityRole="link">
              <Text className="text-caption text-primary dark:text-brand-teal underline">
                Terms of Service
              </Text>
            </Pressable>
            <Text className="text-caption text-gray-400 dark:text-content-tertiary">
              and
            </Text>
            <Pressable onPress={handlePrivacy} accessibilityRole="link">
              <Text className="text-caption text-primary dark:text-brand-teal underline">
                Privacy Policy
              </Text>
            </Pressable>
          </View>
        </View>

        <Link href={routes.login()} asChild>
          <Pressable
            className="flex-row justify-center items-center mt-lg min-h-touch px-md py-sm"
            accessibilityLabel="Sign in to existing account"
            accessibilityRole="link"
          >
            <Text className="text-gray-500 dark:text-content-secondary">
              Already have an account?{' '}
            </Text>
            <Text className="text-primary dark:text-brand-teal font-semibold">
              Sign In
            </Text>
          </Pressable>
        </Link>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
