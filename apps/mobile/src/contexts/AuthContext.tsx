/**
 * Authentication context for the Beach League mobile app.
 * Provides auth state, login/signup/OAuth actions, and route guarding.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { useRouter, useSegments } from 'expo-router';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  readonly id: number;
  readonly phone_number: string | null;
  readonly email: string | null;
  readonly is_verified: boolean;
  readonly auth_provider: string;
}

interface AuthState {
  readonly user: User | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly profileComplete: boolean;
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
  readonly profile_complete?: boolean;
}

/** Store tokens from an AuthResponse and return profile_complete flag. */
async function handleAuthResponse(response: AuthResponse): Promise<{
  readonly user: User;
  readonly profileComplete: boolean;
}> {
  await api.setAuthTokens(response.access_token, response.refresh_token);

  const user: User = {
    id: response.user_id,
    phone_number: response.phone_number ?? null,
    email: response.email ?? null,
    is_verified: response.is_verified,
    auth_provider: response.auth_provider ?? 'phone',
  };

  return {
    user,
    profileComplete: response.profile_complete ?? false,
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
  });

  const router = useRouter();
  const segments = useSegments() as string[];

  // -----------------------------------------------------------------------
  // Session restore on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function loadSession() {
      try {
        const { accessToken } = await api.getStoredTokens();
        if (!accessToken) {
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            profileComplete: false,
          });
          return;
        }

        const userData = await api.getMe();
        const user: User = {
          id: userData.id,
          phone_number: userData.phone_number ?? null,
          email: userData.email ?? null,
          is_verified: userData.is_verified,
          auth_provider: userData.auth_provider ?? 'phone',
        };

        let profileComplete = false;
        try {
          const player = await api.getCurrentUserPlayer();
          profileComplete = isProfileComplete(player);
        } catch {
          // No player yet — profile not complete
        }

        setState({
          user,
          isLoading: false,
          isAuthenticated: true,
          profileComplete,
        });
      } catch {
        await api.clearAuthTokens();
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          profileComplete: false,
        });
      }
    }
    loadSession();
  }, []);

  // -----------------------------------------------------------------------
  // Route guard
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (state.isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding =
      inAuthGroup && segments[1] === 'onboarding';

    if (!state.isAuthenticated && !inAuthGroup) {
      router.replace(routes.welcome());
    } else if (state.isAuthenticated && !state.profileComplete && !inOnboarding) {
      router.replace(routes.onboarding());
    } else if (state.isAuthenticated && state.profileComplete && inAuthGroup) {
      router.replace(routes.home());
    }
  }, [state.isAuthenticated, state.isLoading, state.profileComplete, segments]);

  // -----------------------------------------------------------------------
  // Auth actions
  // -----------------------------------------------------------------------

  const login = useCallback(
    async (params: LoginWithEmailParams | LoginWithPhoneParams) => {
      const credentials =
        'email' in params
          ? { email: params.email, password: params.password }
          : { phone_number: params.phoneNumber, password: params.password };

      const data = await api.login(credentials);
      const result = await handleAuthResponse(data);
      setState({
        user: result.user,
        isLoading: false,
        isAuthenticated: true,
        profileComplete: result.profileComplete,
      });
    },
    [],
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
    const data = await api.googleAuth(idToken);
    const result = await handleAuthResponse(data);
    setState({
      user: result.user,
      isLoading: false,
      isAuthenticated: true,
      profileComplete: result.profileComplete,
    });
  }, []);

  const loginWithApple = useCallback(async (idToken: string) => {
    const data = await api.appleAuth(idToken);
    const result = await handleAuthResponse(data);
    setState({
      user: result.user,
      isLoading: false,
      isAuthenticated: true,
      profileComplete: result.profileComplete,
    });
  }, []);

  const verifyPhone = useCallback(
    async (phoneNumber: string, code: string) => {
      const data = await api.verifyPhone(phoneNumber, code);
      const result = await handleAuthResponse(data);
      setState({
        user: result.user,
        isLoading: false,
        isAuthenticated: true,
        profileComplete: result.profileComplete,
      });
    },
    [],
  );

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      const data = await api.verifyEmail(email, code);
      const result = await handleAuthResponse(data);
      setState({
        user: result.user,
        isLoading: false,
        isAuthenticated: true,
        profileComplete: result.profileComplete,
      });
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout API errors — clear local state regardless
    }
    await api.clearAuthTokens();
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      profileComplete: false,
    });
  }, []);

  const setProfileComplete = useCallback((complete: boolean) => {
    setState((prev) => ({ ...prev, profileComplete: complete }));
  }, []);

  const refreshUser = useCallback(async () => {
    const userData = await api.getMe();
    const user: User = {
      id: userData.id,
      phone_number: userData.phone_number ?? null,
      email: userData.email ?? null,
      is_verified: userData.is_verified,
      auth_provider: userData.auth_provider ?? 'phone',
    };
    setState((prev) => ({ ...prev, user }));
  }, []);

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
