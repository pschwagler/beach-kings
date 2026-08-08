import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Pressable,
  Alert,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, Button, Input, TopNav, Divider } from '@/components/ui';
import { CrownIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { useTheme } from '@/contexts/ThemeContext';
import { FormError } from '@/components/forms';
import {
  useGoogleSignIn,
  signInWithApple,
  isAppleSignInAvailable,
  OAuthCancelledError,
  OAuthNotConfiguredError,
} from '@/lib/oauth';
import { routes } from '@/lib/navigation';
import { hapticError, hapticLight } from '@/utils/haptics';
import { loginSchema, type LoginFormValues } from '@/lib/validators';
import DevLoginPanel from '@/components/dev/DevLoginPanel';
import { thirdPartyColors } from '@/theme/thirdPartyColors';

export default function LoginScreen(): React.ReactNode {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const palette = usePaletteColors();
  const { isDark } = useTheme();
  const appleBg = isDark
    ? palette.bgSurface
    : thirdPartyColors.apple.lightBackground;
  const appleFg = isDark
    ? palette.textDefault
    : thirdPartyColors.apple.lightForeground;
  const router = useRouter();

  const passwordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    setValue,
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
        Alert.alert(
          'Sign In Failed',
          'Google sign-in failed. Please try again.',
        );
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
        Alert.alert(
          'Login Failed',
          'Invalid email or password. Please try again.',
        );
      }
    },
    [login],
  );

  const handleDevFill = useCallback(
    (email: string, password: string) => {
      setValue('email', email);
      setValue('password', password);
      void handleSubmit(onSubmit)();
    },
    [setValue, handleSubmit, onSubmit],
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
      const credential = await signInWithApple();
      await loginWithApple(credential);
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
    <SafeAreaView className="flex-1 bg-page">
      <TopNav title="Log In" showBack />

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
              Welcome back
            </AppText>
          </View>

          <View className="bg-surface rounded-card p-lg gap-md">
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
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit(onSubmit)}
                    className={errors.password ? 'border-danger' : ''}
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
              <AppText className="text-footnote text-brand-teal font-medium">
                Forgot Password?
              </AppText>
            </Pressable>

            <Button
              title="Log In"
              onPress={handleSubmit(onSubmit)}
              variant="secondary"
              disabled={isSubmitting}
              loading={isSubmitting}
            />
          </View>

          <View className="flex-row items-center my-md">
            <Divider className="flex-1" />
            <AppText className="mx-md text-footnote text-muted">OR</AppText>
            <Divider className="flex-1" />
          </View>

          <View className="gap-sm">
            <Pressable
              className="flex-row items-center justify-center gap-sm min-h-touch rounded-lg bg-surface border border-border-strong px-lg"
              onPress={() => {
                void hapticLight();
                void handleGoogleSignIn();
              }}
              accessibilityLabel="Continue with Google"
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
                Continue with Google
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
                accessibilityLabel="Continue with Apple"
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
                  Continue with Apple
                </AppText>
              </Pressable>
            )}
          </View>

          <Link href={routes.signup()} asChild>
            <Pressable
              className="flex-row justify-center items-center mt-lg min-h-touch px-md py-sm"
              accessibilityLabel="Sign up for a new account"
              accessibilityRole="link"
            >
              <AppText className="text-muted">Don't have an account? </AppText>
              <AppText className="text-brand-teal font-semibold">
                Sign Up
              </AppText>
            </Pressable>
          </Link>

          <DevLoginPanel onSelect={handleDevFill} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
