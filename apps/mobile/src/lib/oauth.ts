/**
 * OAuth helpers for Google (expo-auth-session) and Apple (expo-apple-authentication).
 *
 * Usage:
 *   const { promptGoogle, isGoogleConfigured } = useGoogleSignIn(onGoogleToken);
 *   const idToken = await signInWithApple();
 *
 * Configuration comes from EXPO_PUBLIC_* env vars (see README).
 */

import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

type OnTokenHandler = (idToken: string) => Promise<void> | void;

const GOOGLE_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// expo-auth-session v7 throws synchronously from useAuthRequest when the
// platform-required client ID is undefined. When unconfigured we pass a
// syntactically-valid placeholder so the hook initializes; the real gate is
// isGoogleSignInConfigured(), which short-circuits promptGoogle before any
// request is made.
const PLACEHOLDER_CLIENT_ID = 'unconfigured.apps.googleusercontent.com';

export class OAuthNotConfiguredError extends Error {
  constructor(provider: 'google' | 'apple') {
    super(`${provider} sign-in is not configured`);
    this.name = 'OAuthNotConfiguredError';
  }
}

export class OAuthCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'OAuthCancelledError';
  }
}

/**
 * Whether the Google OAuth client IDs are present for the current platform.
 */
export function isGoogleSignInConfigured(): boolean {
  if (Platform.OS === 'ios') return Boolean(GOOGLE_IOS || GOOGLE_WEB);
  if (Platform.OS === 'android') return Boolean(GOOGLE_ANDROID || GOOGLE_WEB);
  return Boolean(GOOGLE_WEB);
}

/**
 * Hook returning a function that triggers the Google sign-in flow.
 * The `onToken` callback is fired with the Google ID token on success —
 * the caller is responsible for exchanging it with the backend.
 */
export function useGoogleSignIn(onToken: OnTokenHandler): {
  readonly promptGoogle: () => Promise<void>;
  readonly isConfigured: boolean;
} {
  const [, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID ?? PLACEHOLDER_CLIENT_ID,
    iosClientId: GOOGLE_IOS ?? PLACEHOLDER_CLIENT_ID,
    webClientId: GOOGLE_WEB ?? PLACEHOLDER_CLIENT_ID,
  });

  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken =
      response.authentication?.idToken ??
      (response.params as Record<string, string> | undefined)?.id_token ??
      null;
    if (idToken) {
      void onTokenRef.current(idToken);
    }
  }, [response]);

  const promptGoogle = useCallback(async () => {
    if (!isGoogleSignInConfigured()) {
      throw new OAuthNotConfiguredError('google');
    }
    const result = await promptAsync();
    if (result?.type === 'cancel' || result?.type === 'dismiss') {
      throw new OAuthCancelledError();
    }
  }, [promptAsync]);

  return { promptGoogle, isConfigured: isGoogleSignInConfigured() };
}

/**
 * Returns true if Apple sign-in is available on this device (iOS 13+).
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

/**
 * Trigger the native Apple sign-in sheet and return the identity token.
 */
export async function signInWithApple(): Promise<string> {
  if (Platform.OS !== 'ios') {
    throw new OAuthNotConfiguredError('apple');
  }
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      throw new Error('Apple did not return an identity token');
    }
    return credential.identityToken;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED') {
      throw new OAuthCancelledError();
    }
    throw err;
  }
}
