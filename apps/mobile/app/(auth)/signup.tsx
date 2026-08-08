import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Pressable,
  Alert,
  ScrollView,
  Platform,
  Linking,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import AppText from '@/components/ui/AppText';
import Svg, { Path, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input, TopNav, Divider } from '@/components/ui';
import { CrownIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { useTheme } from '@/contexts/ThemeContext';
import { thirdPartyColors } from '@/theme/thirdPartyColors';
import { FormError } from '@/components/forms';
import {
  useGoogleSignIn,
  signInWithApple,
  isAppleSignInAvailable,
  OAuthCancelledError,
  OAuthNotConfiguredError,
} from '@/lib/oauth';
import { routes } from '@/lib/navigation';
import { PUBLIC_URLS } from '@/lib/publicUrls';
import { hapticError, hapticLight } from '@/utils/haptics';
import { signupSchema, type SignupFormValues } from '@/lib/validators';

export default function SignupScreen(): React.ReactNode {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const { signup, loginWithGoogle, loginWithApple } = useAuth();
  const palette = usePaletteColors();
  const { isDark } = useTheme();
  const appleBg = isDark
    ? palette.bgSurface
    : thirdPartyColors.apple.lightBackground;
  const appleFg = isDark
    ? palette.textDefault
    : thirdPartyColors.apple.lightForeground;
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
        Alert.alert(
          'Sign Up Failed',
          'Google sign-in failed. Please try again.',
        );
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
        Alert.alert(
          'Signup Failed',
          'Could not create account. Please try again.',
        );
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
    void Linking.openURL(PUBLIC_URLS.terms);
  }, []);

  const handlePrivacy = useCallback(() => {
    void Linking.openURL(PUBLIC_URLS.privacy);
  }, []);

  const handleAppleSignIn = useCallback(async () => {
    try {
      const credential = await signInWithApple();
      await loginWithApple(credential);
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
    <SafeAreaView className="flex-1 bg-page">
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
          <View className="items-center mb-md">
            <CrownIcon size={40} color={palette.brandGold} />
            <AppText className="text-footnote text-muted mt-xxs">
              Create your player profile
            </AppText>
          </View>

          <View className="gap-sm mb-md">
            <Pressable
              className="flex-row items-center justify-center gap-sm min-h-touch rounded-lg bg-surface border border-border-strong px-lg"
              onPress={() => {
                void hapticLight();
                void handleGoogleSignIn();
              }}
              accessibilityLabel="Sign Up with Google"
              accessibilityRole="button"
            >
              <Svg width={18} height={18} viewBox="0 0 18 18">
                <G>
                  <Path
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                    fill={thirdPartyColors.google.blue}
                  />
                  <Path
                    d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                    fill={thirdPartyColors.google.green}
                  />
                  <Path
                    d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                    fill={thirdPartyColors.google.yellow}
                  />
                  <Path
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                    fill={thirdPartyColors.google.red}
                  />
                </G>
              </Svg>
              <AppText className="font-semibold text-body text-default">
                Sign Up with Google
              </AppText>
            </Pressable>

            {showApple && (
              <Pressable
                className={`flex-row items-center justify-center gap-sm min-h-touch rounded-lg px-lg ${isDark ? 'border border-border-strong' : ''}`}
                style={{ backgroundColor: appleBg }}
                onPress={() => {
                  void hapticLight();
                  void handleAppleSignIn();
                }}
                accessibilityLabel="Sign Up with Apple"
                accessibilityRole="button"
              >
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path
                    d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                    fill={appleFg}
                  />
                </Svg>
                <AppText
                  className="font-semibold text-body"
                  style={{ color: appleFg }}
                >
                  Sign Up with Apple
                </AppText>
              </Pressable>
            )}
          </View>

          <View className="flex-row items-center my-md">
            <Divider className="flex-1" />
            <AppText className="mx-md text-footnote text-muted">OR</AppText>
            <Divider className="flex-1" />
          </View>

          <View className="bg-surface rounded-card p-lg gap-md">
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
                      className={errors.firstName ? 'border-danger' : ''}
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
                      className={errors.lastName ? 'border-danger' : ''}
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
                    className={errors.email ? 'border-danger' : ''}
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
                    className={errors.password ? 'border-danger' : ''}
                  />
                )}
              />
              {errors.password ? (
                <FormError message={errors.password.message} />
              ) : (
                <AppText className="text-caption text-muted mt-xxs">
                  At least 8 characters.
                </AppText>
              )}
            </View>

            <Button
              title="Create Account"
              onPress={handleSubmit(onSubmit)}
              variant="secondary"
              disabled={isSubmitting}
              loading={isSubmitting}
            />
          </View>

          <View className="items-center mt-md px-lg">
            <AppText className="text-caption text-muted text-center">
              By creating an account, you agree to our
            </AppText>
            <View className="flex-row gap-xs mt-xxs">
              <Pressable onPress={handleTos} accessibilityRole="link">
                <AppText className="text-caption text-brand-teal underline">
                  Terms of Service
                </AppText>
              </Pressable>
              <AppText className="text-caption text-muted">and</AppText>
              <Pressable onPress={handlePrivacy} accessibilityRole="link">
                <AppText className="text-caption text-brand-teal underline">
                  Privacy Policy
                </AppText>
              </Pressable>
            </View>
          </View>

          <Link href={routes.login()} asChild>
            <Pressable
              className="flex-row justify-center items-center mt-lg min-h-touch px-md py-sm"
              accessibilityLabel="Sign in to existing account"
              accessibilityRole="link"
            >
              <AppText className="text-muted">
                Already have an account?{' '}
              </AppText>
              <AppText className="text-brand-teal font-semibold">
                Sign In
              </AppText>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
