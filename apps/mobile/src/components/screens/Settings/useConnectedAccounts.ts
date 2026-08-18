/**
 * Hook encapsulating the "Connect Google / Apple" linking flows for the
 * Settings Connected Accounts section.
 *
 * - Google: uses `useGoogleSignIn` (expo-auth-session) to get an id_token,
 *   then calls `api.linkGoogle(idToken)` and refreshes the auth user.
 * - Apple: uses `signInWithApple` (expo-apple-authentication) the same way.
 * - 409 (account already linked elsewhere) → user-facing Alert.
 * - `OAuthCancelledError` → silently ignored.
 * - Stable backend diagnostics → actionable, provider-specific Alert copy.
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
  OAuthNotConfiguredError,
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

type Provider = 'Google' | 'Apple';

interface ProviderLinkErrorShape {
  readonly status?: number;
  readonly response?: {
    readonly status?: number;
    readonly data?: {
      readonly detail?: string | {
        readonly code?: string;
        readonly message?: string;
      };
    };
  };
}

function providerErrorDetails(error: unknown): { status?: number; code?: string } {
  const shaped = error as ProviderLinkErrorShape;
  const detail = shaped?.response?.data?.detail;
  return {
    status: shaped?.response?.status ?? shaped?.status,
    code: typeof detail === 'object' && detail != null ? detail.code : undefined,
  };
}

function showProviderLinkError(provider: Provider, error: unknown): void {
  const { status, code } = providerErrorDetails(error);
  if (code === 'PROVIDER_ALREADY_CONNECTED') {
    Alert.alert(
      'Already Connected',
      `This Beach League account already has a different ${provider} account connected.`,
    );
    return;
  }
  if (status === 409 || code === 'PROVIDER_LINK_CONFLICT') {
    Alert.alert(
      'Already Linked',
      `This ${provider} account is already linked to another Beach League account.`,
    );
    return;
  }

  if (code === 'PROVIDER_LINK_CONFIG' || code === 'PROVIDER_LINK_AUDIENCE') {
    Alert.alert(
      'Account Linking Unavailable',
      `${provider} linking is not configured correctly for this app build. Please contact support and mention ${code}.`,
    );
    return;
  }

  if (code === 'PROVIDER_LINK_TOKEN_INVALID') {
    Alert.alert(
      'Authorization Expired',
      `${provider} could not verify this authorization. Please sign in again. (${code})`,
    );
    return;
  }

  if (code === 'APPLE_LINK_CODE_EXCHANGE') {
    Alert.alert(
      'Apple Link Not Completed',
      `Beach League could not complete the secure Apple authorization. Your account was not partially linked. Please try again. (${code})`,
    );
    return;
  }

  if (code === 'PROVIDER_LINK_VERIFICATION_UNAVAILABLE') {
    Alert.alert(
      'Provider Temporarily Unavailable',
      `${provider} authorization could not be verified right now. Please try again. (${code})`,
    );
    return;
  }

  Alert.alert(
    'Link Failed',
    `Could not link your ${provider} account. Please try again.${code ? ` (${code})` : ''}`,
  );
}

function showOAuthStartError(provider: Provider, error: unknown): void {
  if (error instanceof OAuthNotConfiguredError) {
    Alert.alert(
      'Account Linking Unavailable',
      `${provider} linking is not configured in this app build. Please update the app or contact support. (PROVIDER_LINK_CONFIG)`,
    );
    return;
  }
  Alert.alert('Sign In Failed', `${provider} sign-in failed. Please try again.`);
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
      } catch (err) {
        showProviderLinkError('Google', err);
        setIsLinkingGoogle(false);
        return;
      }
      try {
        await refreshUser();
      } catch {
        Alert.alert(
          'Account Linked',
          'Your Google account was linked, but Settings could not refresh. Reopen Settings to see the updated status.',
        );
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
      showOAuthStartError('Google', err);
    }
  }, [promptGoogle]);

  const handleConnectApple = useCallback(async () => {
    setIsLinkingApple(true);
    try {
      const credential = await signInWithApple();
      try {
        await api.linkApple(credential);
      } catch (err) {
        showProviderLinkError('Apple', err);
        return;
      }
      try {
        await refreshUser();
      } catch {
        Alert.alert(
          'Account Linked',
          'Your Apple account was linked, but Settings could not refresh. Reopen Settings to see the updated status.',
        );
      }
    } catch (err) {
      if (err instanceof OAuthCancelledError) return;
      showOAuthStartError('Apple', err);
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
