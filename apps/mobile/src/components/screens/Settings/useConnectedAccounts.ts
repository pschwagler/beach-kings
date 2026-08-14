/**
 * Hook encapsulating the "Connect Google / Apple" linking flows for the
 * Settings Connected Accounts section.
 *
 * - Google: uses `useGoogleSignIn` (expo-auth-session) to get an id_token,
 *   then calls `api.linkGoogle(idToken)` and refreshes the auth user.
 * - Apple: uses `signInWithApple` (expo-apple-authentication) the same way.
 * - 409 (account already linked elsewhere) → user-facing Alert.
 * - `OAuthCancelledError` → silently ignored.
 * - Other errors → generic Alert.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  useGoogleSignIn,
  signInWithApple,
  isAppleSignInAvailable,
  OAuthCancelledError,
} from '@/lib/oauth';

export interface UseConnectedAccountsResult {
  /** True when Apple sign-in is available on this device. */
  readonly appleAvailable: boolean;
  /** True while a Google link request is in-flight. */
  readonly isLinkingGoogle: boolean;
  /** True while an Apple link request is in-flight. */
  readonly isLinkingApple: boolean;
  /** Trigger the Google sign-in → link flow. */
  readonly handleConnectGoogle: () => Promise<void>;
  /** Trigger the Apple sign-in → link flow. */
  readonly handleConnectApple: () => Promise<void>;
}

/**
 * Checks the HTTP status code on an unknown error value.
 * The api-client throws `Error` objects; 409 responses are indicated by a
 * message that contains "409" or a `.status` property set to 409.
 */
function is409(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.includes('409')) return true;
    if ((err as Error & { status?: number }).status === 409) return true;
  }
  return false;
}

export function useConnectedAccounts(): UseConnectedAccountsResult {
  const { refreshUser } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isLinkingApple, setIsLinkingApple] = useState(false);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  // Called by useGoogleSignIn when the OAuth flow succeeds and returns a token.
  const onGoogleToken = useCallback(
    async (idToken: string) => {
      setIsLinkingGoogle(true);
      try {
        await api.linkGoogle(idToken);
        await refreshUser();
      } catch (err) {
        if (is409(err)) {
          Alert.alert(
            'Already Linked',
            'This Google account is already linked to another Beach League account.',
          );
        } else {
          Alert.alert('Link Failed', 'Could not link your Google account. Please try again.');
        }
      } finally {
        setIsLinkingGoogle(false);
      }
    },
    [refreshUser],
  );

  const { promptGoogle } = useGoogleSignIn(onGoogleToken);

  const handleConnectGoogle = useCallback(async () => {
    try {
      await promptGoogle();
    } catch (err) {
      if (err instanceof OAuthCancelledError) return;
      Alert.alert('Sign In Failed', 'Google sign-in failed. Please try again.');
    }
  }, [promptGoogle]);

  const handleConnectApple = useCallback(async () => {
    setIsLinkingApple(true);
    try {
      const credential = await signInWithApple();
      try {
        await api.linkApple(credential);
        await refreshUser();
      } catch (err) {
        if (is409(err)) {
          Alert.alert(
            'Already Linked',
            'This Apple account is already linked to another Beach League account.',
          );
        } else {
          Alert.alert('Link Failed', 'Could not link your Apple account. Please try again.');
        }
      }
    } catch (err) {
      if (err instanceof OAuthCancelledError) return;
      Alert.alert('Sign In Failed', 'Apple sign-in failed. Please try again.');
    } finally {
      setIsLinkingApple(false);
    }
  }, [refreshUser]);

  return {
    appleAvailable,
    isLinkingGoogle,
    isLinkingApple,
    handleConnectGoogle,
    handleConnectApple,
  };
}
