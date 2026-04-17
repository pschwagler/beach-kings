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
  readonly phoneNumber: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
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
  readonly logout: () => Promise<void>;
  readonly setProfileComplete: (complete: boolean) => void;
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

/** Store tokens from an AuthResponse and return profile_complete flag. */
async function handleAuthResponse(response: Record<string, unknown>): Promise<{
  readonly user: User;
  readonly profileComplete: boolean;
}> {
  const { access_token, refresh_token } = response as {
    access_token: string;
    refresh_token: string;
  };
  await api.setAuthTokens(access_token, refresh_token);

  const user: User = {
    id: response.user_id as number,
    phone_number: (response.phone_number as string) ?? null,
    email: (response.email as string) ?? null,
    is_verified: response.is_verified as boolean,
    auth_provider: (response.auth_provider as string) ?? 'phone',
  };

  return {
    user,
    profileComplete: (response.profile_complete as boolean) ?? false,
  };
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
  const segments = useSegments();

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

        // Fetch user info
        const meResponse = await api.client.axiosInstance.get('/api/auth/me');
        const userData = meResponse.data;
        const user: User = {
          id: userData.id,
          phone_number: userData.phone_number ?? null,
          email: userData.email ?? null,
          is_verified: userData.is_verified,
          auth_provider: userData.auth_provider ?? 'phone',
        };

        // Derive profileComplete from player data
        let profileComplete = false;
        try {
          const playerResponse = await api.client.axiosInstance.get(
            '/api/users/me/player',
          );
          const player = playerResponse.data;
          profileComplete = Boolean(player?.gender && player?.level);
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
      // Not logged in — go to welcome
      router.replace('/(auth)/welcome');
    } else if (state.isAuthenticated && !state.profileComplete && !inOnboarding) {
      // Logged in but profile incomplete — go to onboarding
      router.replace('/(auth)/onboarding');
    } else if (state.isAuthenticated && state.profileComplete && inAuthGroup) {
      // Fully authenticated + complete profile — go home
      router.replace('/(tabs)/home');
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

      const response = await api.client.axiosInstance.post(
        '/api/auth/login',
        credentials,
      );
      const result = await handleAuthResponse(response.data);
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
    const response = await api.client.axiosInstance.post('/api/auth/signup', {
      phone_number: params.phoneNumber,
      password: params.password,
      first_name: params.firstName,
      last_name: params.lastName,
      email: params.email || undefined,
    });
    const result = await handleAuthResponse(response.data);
    setState({
      user: result.user,
      isLoading: false,
      isAuthenticated: true,
      profileComplete: result.profileComplete,
    });
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const response = await api.client.axiosInstance.post('/api/auth/google', {
      id_token: idToken,
    });
    const result = await handleAuthResponse(response.data);
    setState({
      user: result.user,
      isLoading: false,
      isAuthenticated: true,
      profileComplete: result.profileComplete,
    });
  }, []);

  const loginWithApple = useCallback(async (idToken: string) => {
    const response = await api.client.axiosInstance.post('/api/auth/apple', {
      id_token: idToken,
    });
    const result = await handleAuthResponse(response.data);
    setState({
      user: result.user,
      isLoading: false,
      isAuthenticated: true,
      profileComplete: result.profileComplete,
    });
  }, []);

  const verifyPhone = useCallback(
    async (phoneNumber: string, code: string) => {
      const response = await api.client.axiosInstance.post(
        '/api/auth/verify-phone',
        { phone_number: phoneNumber, code },
      );
      const result = await handleAuthResponse(response.data);
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
      await api.client.axiosInstance.post('/api/auth/logout');
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
    logout,
    setProfileComplete,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
