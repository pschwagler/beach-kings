/**
 * Authentication context for the Beach League mobile app.
 * Provides auth state, login/signup/OAuth actions, and route guarding.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { playerQueries } from '@/features/player';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  readonly id: number;
  readonly phone_number: string | null;
  readonly email: string | null;
  readonly is_verified: boolean;
  readonly auth_provider: string;
  /** True when the user has a password set (false for OAuth-only accounts). */
  readonly has_password: boolean;
  /** Whether the user has a Google account linked. */
  readonly google_connected: boolean;
  /** Whether the user has an Apple account linked. */
  readonly apple_connected: boolean;
  /** Whether the user's profile is hidden from public discovery. */
  readonly profile_is_private: boolean;
  /** Whether the user's game history is visible to others. */
  readonly show_game_history: boolean;
  /** ISO timestamp when account deletion was scheduled, or null. */
  readonly deletion_scheduled_at: string | null;
}

interface AuthState {
  readonly user: User | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly profileComplete: boolean;
  readonly isNewUser: boolean;
}

interface LoginWithEmailParams {
  readonly email: string;
  readonly password: string;
}

interface LoginWithPhoneParams {
  readonly phoneNumber: string;
  readonly password: string;
}

interface SignupParams {
  readonly email: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phoneNumber?: string;
}

interface AuthContextValue extends AuthState {
  readonly login: (
    params: LoginWithEmailParams | LoginWithPhoneParams,
  ) => Promise<void>;
  readonly signup: (params: SignupParams) => Promise<void>;
  readonly loginWithGoogle: (idToken: string) => Promise<void>;
  readonly loginWithApple: (idToken: string) => Promise<void>;
  readonly verifyPhone: (
    phoneNumber: string,
    code: string,
  ) => Promise<void>;
  readonly verifyEmail: (email: string, code: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly setProfileComplete: (complete: boolean) => void;
  readonly refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook to access auth state and actions.
 * Must be used within AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  readonly children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AuthResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly user_id: number;
  readonly phone_number?: string | null;
  readonly email?: string | null;
  readonly is_verified: boolean;
  readonly auth_provider?: string;
  readonly profile_complete?: boolean | null;
  readonly is_new_user?: boolean;
  /** True when the user has a password set; absent or false for OAuth-only accounts. */
  readonly has_password?: boolean;
}

/** Convert an auth response into the canonical client-side identity. */
function parseAuthResponse(response: AuthResponse): {
  readonly user: User;
  readonly isNewUser: boolean;
} {
  const user: User = {
    id: response.user_id,
    phone_number: response.phone_number ?? null,
    email: response.email ?? null,
    is_verified: response.is_verified,
    auth_provider: response.auth_provider ?? 'phone',
    has_password: response.has_password !== false,
    google_connected: false,
    apple_connected: false,
    profile_is_private: false,
    show_game_history: false,
    deletion_scheduled_at: null,
  };

  return {
    user,
    isNewUser: response.is_new_user ?? false,
  };
}

/** A profile is "complete" only when all required fields are present. */
function isProfileComplete(player: {
  readonly gender?: string | null;
  readonly level?: string | number | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly location_id?: string | null;
} | null | undefined): boolean {
  if (!player) return false;
  return Boolean(
    player.gender &&
      player.level &&
      player.city &&
      player.state &&
      player.location_id,
  );
}

function hasRetainedAuthenticatedStack(
  rootState: ReturnType<typeof useRootNavigationState>,
): boolean {
  return (
    rootState.type === 'stack' &&
    rootState.routes.length > 1 &&
    rootState.routes.some((route) => route.name === '(stack)')
  );
}

const UNAUTHENTICATED_STATE: AuthState = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  profileComplete: false,
  isNewUser: false,
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export default function AuthProvider({
  children,
}: AuthProviderProps): React.ReactNode {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    profileComplete: false,
    isNewUser: false,
  });

  const router = useRouter();
  const queryClient = useQueryClient();
  const rootNavigationState = useRootNavigationState();
  const segments = useSegments() as string[];
  const stateRef = useRef(state);
  const operationRevisionRef = useRef(0);
  const transitionQueueRef = useRef<Promise<void>>(Promise.resolve());

  const publishState = useCallback((nextState: AuthState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const beginAuthOperation = useCallback((): number => {
    operationRevisionRef.current += 1;
    return operationRevisionRef.current;
  }, []);

  const isCurrentOperation = useCallback(
    (revision: number): boolean => operationRevisionRef.current === revision,
    [],
  );

  const enqueueTransition = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const result = transitionQueueRef.current
      .catch(() => undefined)
      .then(work);
    transitionQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  const cancelQueryWork = useCallback(async (): Promise<void> => {
    await queryClient.cancelQueries();
  }, [queryClient]);

  const fetchProfileComplete = useCallback(async (userId: number): Promise<boolean> => {
    try {
      const player = await queryClient.fetchQuery(playerQueries.me(userId));
      return isProfileComplete(player);
    } catch {
      return false;
    }
  }, [queryClient]);

  const clearCacheAndPublish = useCallback(
    (nextState: AuthState): void => {
      // Clear both caches in the same synchronous turn as identity publication
      // so outgoing query observers cannot refetch between those operations.
      // In-flight mutations are protected separately by user-scoped keys and
      // conditional cache-update functions; TanStack mutations are not cancellable.
      queryClient.clear();
      publishState(nextState);
    },
    [publishState, queryClient],
  );

  const commitUnauthenticated = useCallback(
    async (revision: number, clearTokens: boolean): Promise<boolean> =>
      enqueueTransition(async () => {
        if (!isCurrentOperation(revision)) return false;
        await cancelQueryWork();
        if (!isCurrentOperation(revision)) return false;
        if (clearTokens) {
          try {
            await api.clearAuthTokens();
          } catch {
            // Local state and private caches must still be retired even if the
            // storage adapter fails to remove a credential.
          }
          if (!isCurrentOperation(revision)) return false;
        }
        clearCacheAndPublish(UNAUTHENTICATED_STATE);
        return true;
      }),
    [cancelQueryWork, clearCacheAndPublish, enqueueTransition, isCurrentOperation],
  );

  const prepareAuthentication = useCallback(
    async (revision: number): Promise<boolean> =>
      enqueueTransition(async () => {
        if (!isCurrentOperation(revision)) return false;
        if (!stateRef.current.isAuthenticated) return true;

        // Account replacement is explicitly two phase: fully retire the old
        // identity and its cache before a new credential is installed.
        await cancelQueryWork();
        if (!isCurrentOperation(revision)) return false;
        try {
          await api.clearAuthTokens();
        } catch {
          // Continue the two-phase retirement. A subsequent successful login
          // overwrites the credential before the new identity is published.
        }
        if (!isCurrentOperation(revision)) return false;
        clearCacheAndPublish(UNAUTHENTICATED_STATE);
        return true;
      }),
    [cancelQueryWork, clearCacheAndPublish, enqueueTransition, isCurrentOperation],
  );

  const completeAuthentication = useCallback(
    async (revision: number, response: AuthResponse): Promise<void> => {
      const parsed = parseAuthResponse(response);
      const installed = await enqueueTransition(async () => {
        if (!isCurrentOperation(revision)) return false;
        await cancelQueryWork();
        if (!isCurrentOperation(revision)) return false;
        // Retire every previous identity before installing the new credential.
        // The player request below then becomes the first entry for this user.
        queryClient.clear();
        await api.setAuthTokens(response.access_token, response.refresh_token);
        return isCurrentOperation(revision);
      });
      if (!installed) return;

      const profileComplete = await fetchProfileComplete(parsed.user.id);

      await enqueueTransition(async () => {
        if (!isCurrentOperation(revision)) return;
        // Keep the player query populated so the first authenticated screen
        // reads the same snapshot used to decide profile completeness.
        publishState({
          user: parsed.user,
          isLoading: false,
          isAuthenticated: true,
          profileComplete,
          isNewUser: parsed.isNewUser,
        });
      });
    },
    [
      cancelQueryWork,
      enqueueTransition,
      fetchProfileComplete,
      isCurrentOperation,
      publishState,
      queryClient,
    ],
  );

  // Refresh-token exhaustion is an authentication transition, not only a
  // transport error. The API client emits after it has invalidated credentials.
  useEffect(() => {
    return api.onAuthInvalidated(() => {
      const revision = beginAuthOperation();
      void commitUnauthenticated(revision, false);
    });
  }, [beginAuthOperation, commitUnauthenticated]);

  // -----------------------------------------------------------------------
  // Session restore on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function loadSession() {
      const revision = beginAuthOperation();
      try {
        const { accessToken } = await api.getStoredTokens();
        if (!isCurrentOperation(revision)) return;
        if (!accessToken) {
          await commitUnauthenticated(revision, false);
          return;
        }

        const userData = await api.getMe();
        if (!isCurrentOperation(revision)) return;
        const user: User = {
          id: userData.id,
          phone_number: userData.phone_number ?? null,
          email: userData.email ?? null,
          is_verified: userData.is_verified,
          auth_provider: userData.auth_provider ?? 'phone',
          has_password: userData.has_password !== false,
          google_connected: userData.google_connected ?? false,
          apple_connected: userData.apple_connected ?? false,
          profile_is_private: userData.profile_is_private ?? false,
          show_game_history: userData.show_game_history ?? false,
          deletion_scheduled_at: userData.deletion_scheduled_at ?? null,
        };

        const cachePrepared = await enqueueTransition(async () => {
          if (!isCurrentOperation(revision)) return false;
          await cancelQueryWork();
          if (!isCurrentOperation(revision)) return false;
          queryClient.clear();
          return true;
        });
        if (!cachePrepared) return;

        const profileComplete = await fetchProfileComplete(user.id);
        if (!isCurrentOperation(revision)) return;

        await enqueueTransition(async () => {
          if (!isCurrentOperation(revision)) return;
          publishState({
            user,
            isLoading: false,
            isAuthenticated: true,
            profileComplete,
            isNewUser: false,
          });
        });
      } catch {
        if (isCurrentOperation(revision)) {
          await commitUnauthenticated(revision, true);
        }
      }
    }
    void loadSession();
  }, [
    beginAuthOperation,
    cancelQueryWork,
    commitUnauthenticated,
    enqueueTransition,
    fetchProfileComplete,
    isCurrentOperation,
    publishState,
    queryClient,
  ]);

  // -----------------------------------------------------------------------
  // Route guard
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (state.isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding =
      inAuthGroup && segments[1] === 'onboarding';

    if (!state.isAuthenticated && !inAuthGroup) {
      // The root Stack (app/_layout.tsx) keeps (tabs) and (stack) history
      // around so pushed detail screens share back-history with tabs. That
      // means a plain `replace` here only swaps the focused (auth) entry —
      // the previous user's (tabs) screen stays underneath in root-stack
      // history, so Android hardware back (or an edge swipe) from Welcome
      // would pop back into the authenticated app and flash their data.
      // Dismiss the retained (tabs)/(stack) history first so the root stack
      // ends up with just the (auth) entry. Covers both explicit logout and
      // any auth-expiry path, since both flow through this same guard.
      if (
        hasRetainedAuthenticatedStack(rootNavigationState) &&
        router.canDismiss()
      ) {
        router.dismissAll();
      }
      router.replace(routes.welcome());
    } else if (
      state.isAuthenticated &&
      state.isNewUser &&
      !state.profileComplete &&
      !inOnboarding
    ) {
      router.replace(routes.onboarding());
    } else if (
      state.isAuthenticated &&
      inAuthGroup &&
      (state.profileComplete || (!state.isNewUser && !inOnboarding))
    ) {
      router.replace(routes.home());
    }
  }, [
    state.isAuthenticated,
    state.isLoading,
    state.profileComplete,
    state.isNewUser,
    segments,
    rootNavigationState,
    router,
  ]);

  // -----------------------------------------------------------------------
  // Auth actions
  // -----------------------------------------------------------------------

  const login = useCallback(
    async (params: LoginWithEmailParams | LoginWithPhoneParams) => {
      const revision = beginAuthOperation();
      if (!(await prepareAuthentication(revision))) return;
      const credentials =
        'email' in params
          ? { email: params.email, password: params.password }
          : { phone_number: params.phoneNumber, password: params.password };

      const data = await api.login(credentials);
      await completeAuthentication(revision, {
        ...data,
        is_new_user: false,
      });
    },
    [beginAuthOperation, completeAuthentication, prepareAuthentication],
  );

  const signup = useCallback(async (params: SignupParams) => {
    // The signup call now returns a pending-verification response for the
    // email/phone-only branches; session state is not authenticated yet.
    // The verifyEmail/verifyPhone call is what ultimately authenticates.
    await api.signup({
      email: params.email,
      phone_number: params.phoneNumber || undefined,
      password: params.password,
      first_name: params.firstName,
      last_name: params.lastName,
    });
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const revision = beginAuthOperation();
    if (!(await prepareAuthentication(revision))) return;
    const data = await api.googleAuth(idToken);
    await completeAuthentication(revision, data);
  }, [beginAuthOperation, completeAuthentication, prepareAuthentication]);

  const loginWithApple = useCallback(async (idToken: string) => {
    const revision = beginAuthOperation();
    if (!(await prepareAuthentication(revision))) return;
    const data = await api.appleAuth(idToken);
    await completeAuthentication(revision, data);
  }, [beginAuthOperation, completeAuthentication, prepareAuthentication]);

  const verifyPhone = useCallback(
    async (phoneNumber: string, code: string) => {
      const revision = beginAuthOperation();
      if (!(await prepareAuthentication(revision))) return;
      const data = await api.verifyPhone(phoneNumber, code);
      await completeAuthentication(revision, data);
    },
    [beginAuthOperation, completeAuthentication, prepareAuthentication],
  );

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      const revision = beginAuthOperation();
      if (!(await prepareAuthentication(revision))) return;
      const data = await api.verifyEmail(email, code);
      await completeAuthentication(revision, data);
    },
    [beginAuthOperation, completeAuthentication, prepareAuthentication],
  );

  const logout = useCallback(async () => {
    const revision = beginAuthOperation();
    try {
      await api.logout();
    } catch {
      // Ignore logout API errors — clear local state regardless
    }
    if (isCurrentOperation(revision)) {
      await commitUnauthenticated(revision, true);
    } else {
      await transitionQueueRef.current;
    }
  }, [beginAuthOperation, commitUnauthenticated, isCurrentOperation]);

  const setProfileComplete = useCallback((complete: boolean) => {
    const nextState = { ...stateRef.current, profileComplete: complete };
    publishState(nextState);
  }, [publishState]);

  const refreshUser = useCallback(async () => {
    const revision = operationRevisionRef.current;
    const activeUserId = stateRef.current.user?.id;
    const userData = await api.getMe();
    if (
      !isCurrentOperation(revision) ||
      activeUserId == null ||
      stateRef.current.user?.id !== activeUserId ||
      userData.id !== activeUserId
    ) {
      return;
    }
    const user: User = {
      id: userData.id,
      phone_number: userData.phone_number ?? null,
      email: userData.email ?? null,
      is_verified: userData.is_verified,
      auth_provider: userData.auth_provider ?? 'phone',
      has_password: userData.has_password !== false,
      google_connected: userData.google_connected ?? false,
      apple_connected: userData.apple_connected ?? false,
      profile_is_private: userData.profile_is_private ?? false,
      show_game_history: userData.show_game_history ?? false,
      deletion_scheduled_at: userData.deletion_scheduled_at ?? null,
    };
    publishState({ ...stateRef.current, user });
  }, [isCurrentOperation, publishState]);

  // -----------------------------------------------------------------------
  // Context value
  // -----------------------------------------------------------------------

  const value: AuthContextValue = {
    ...state,
    login,
    signup,
    loginWithGoogle,
    loginWithApple,
    verifyPhone,
    verifyEmail,
    logout,
    setProfileComplete,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
