/**
 * Authentication context for the mobile app.
 * Wraps the shared API client and exposes auth state + actions.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { api } from '@/lib/api';

interface User {
  readonly id: number;
  readonly email: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly player_id: number | null;
}

interface AuthState {
  readonly user: User | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  readonly login: (email: string, password: string) => Promise<void>;
  readonly signup: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  readonly logout: () => Promise<void>;
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

export default function AuthProvider({ children }: AuthProviderProps): React.ReactNode {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const router = useRouter();
  const segments = useSegments();

  // Check stored tokens on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const { accessToken } = await api.getStoredTokens();
        if (accessToken) {
          const response = await api.client.axiosInstance.get('/api/users/me');
          setState({
            user: response.data,
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          setState({ user: null, isLoading: false, isAuthenticated: false });
        }
      } catch {
        await api.clearAuthTokens();
        setState({ user: null, isLoading: false, isAuthenticated: false });
      }
    }
    loadSession();
  }, []);

  // Route guard: redirect based on auth state
  useEffect(() => {
    if (state.isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!state.isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (state.isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [state.isAuthenticated, state.isLoading, segments]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.client.axiosInstance.post('/api/auth/login', {
      email,
      password,
    });
    const { access_token, refresh_token, user } = response.data;
    await api.setAuthTokens(access_token, refresh_token);
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);

  const signup = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => {
    const response = await api.client.axiosInstance.post('/api/auth/signup', {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
    });
    const { access_token, refresh_token, user } = response.data;
    await api.setAuthTokens(access_token, refresh_token);
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(async () => {
    await api.clearAuthTokens();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    signup,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
