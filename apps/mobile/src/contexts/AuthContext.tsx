/**
 * Authentication context for mobile app
 * Adapted from web version for React Native
 * Matches web AuthContext API for component compatibility
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../services/api';

interface User {
  id: number;
  email?: string;
  phone?: string;
  name?: string;
  player_id?: number;
}

interface Player {
  id: number;
  name?: string;
  full_name?: string;
  nickname?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  currentUserPlayer: Player | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  fetchCurrentUser: () => Promise<void>;
  loginWithPassword: (phoneNumber: string, password: string) => Promise<void>;
  loginWithSms: (phoneNumber: string, code: string) => Promise<void>;
  signup: (data: { phoneNumber: string; password: string; fullName: string; email?: string }) => Promise<any>;
  sendVerificationCode: (phoneNumber: string) => Promise<void>;
  verifyPhone: (phoneNumber: string, code: string) => Promise<{ profile_complete: boolean }>;
  resetPassword: (phoneNumber: string) => Promise<any>;
  verifyPasswordReset: (phoneNumber: string, code: string) => Promise<any>;
  confirmPasswordReset: (resetToken: string, newPassword: string) => Promise<any>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizePhone = (phone: string | undefined) => phone?.trim();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [currentUserPlayer, setCurrentUserPlayer] = useState<Player | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      // Verify tokens before making request
      const storedTokens = await api.getStoredTokens();

      if (!storedTokens.accessToken) {
        console.error('[AuthContext] fetchCurrentUser: No access token available!');
        throw new Error('No access token available');
      }
      
      // Get current user from /api/auth/me
      let userData = null;
      if ((api as any).getCurrentUser) {
        userData = await (api as any).getCurrentUser();
      } else {
        // Use the custom axios that reads from storage
        const axiosInstance = (api as any).axios;
        if (!axiosInstance) {
          throw new Error('Axios instance not available');
        }
        const response = await axiosInstance.get('/api/auth/me');
        userData = response.data;
      }
      
      setUser(userData);

      // Also fetch the current user's player profile
      try {
        const player = await api.getCurrentUserPlayer();
        player.first_name = player.nickname ? player.nickname : player.full_name?.split(' ')[0];
        setCurrentUserPlayer(player);
      } catch (playerError: any) {
        // Player might not exist yet, that's okay
        if (playerError.response?.status !== 404) {
          console.error('[AuthContext] Error fetching current user player:', playerError);
          console.error('[AuthContext] Player error details:', playerError.response?.data || playerError.message);
        }
        setCurrentUserPlayer(null);
      }
    } catch (error: any) {
      console.error('[AuthContext] Error in fetchCurrentUser:', error);
      console.error('[AuthContext] Error response:', error.response?.data || error.message);
      console.error('[AuthContext] Error status:', error.response?.status);
      
      // Only clear tokens on 401 (unauthorized) - don't clear on network errors, 500s, etc.
      const isUnauthorized = error.response?.status === 401;
      if (isUnauthorized) {
        await api.clearAuthTokens();
        setUser(null);
        setCurrentUserPlayer(null);
      } else {
        // For other errors (network, 500, etc.), keep user logged in but log the error
        console.error('[AuthContext] Non-401 error - keeping tokens but user not set');
      }
    }
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      const tokens = await api.getStoredTokens();
      if (tokens.accessToken && tokens.refreshToken) {
        await api.setAuthTokens(tokens.accessToken, tokens.refreshToken);
        await fetchCurrentUser();
      } else {
        await api.clearAuthTokens();
      }
      setIsInitializing(false);
    };
    initializeAuth();
  }, [fetchCurrentUser]);

  const handleAuthSuccess = useCallback(
    async (authResponse: any) => {
      await api.setAuthTokens(authResponse.access_token, authResponse.refresh_token);

      // Small delay to ensure axios interceptor has updated
      await new Promise(resolve => setTimeout(resolve, 100));

      await fetchCurrentUser();
      // Return profile_complete flag for use in components
      return authResponse.profile_complete !== false;
    },
    [fetchCurrentUser]
  );

  const loginWithPassword = useCallback(
    async (phoneNumber: string, password: string) => {
      const axiosInstance = (api as any).axios || (api as any).client?.axiosInstance || (api as any).api || api;
      const response = await axiosInstance.post('/api/auth/login', {
        phone_number: normalizePhone(phoneNumber),
        password,
      });
      await handleAuthSuccess(response.data);
    },
    [handleAuthSuccess]
  );

  const loginWithSms = useCallback(
    async (phoneNumber: string, code: string) => {
      const axiosInstance = (api as any).axios || (api as any).client?.axiosInstance || (api as any).api || api;
      const response = await axiosInstance.post('/api/auth/sms-login', {
        phone_number: normalizePhone(phoneNumber),
        code,
      });
      await handleAuthSuccess(response.data);
    },
    [handleAuthSuccess]
  );

  const signup = useCallback(async ({ phoneNumber, password, fullName, email }: { phoneNumber: string; password: string; fullName: string; email?: string }) => {
    const axiosInstance = (api as any).axios || (api as any).client?.axiosInstance || (api as any).api || api;
    const response = await axiosInstance.post('/api/auth/signup', {
      phone_number: normalizePhone(phoneNumber),
      password: password.trim(),
      full_name: fullName.trim(),
      email: email?.trim() || undefined,
    });
    return response.data;
  }, []);

  const sendVerificationCode = useCallback(async (phoneNumber: string) => {
    const axiosInstance = (api as any).axios || (api as any).client?.axiosInstance || (api as any).api || api;
    await axiosInstance.post('/api/auth/send-verification', {
      phone_number: normalizePhone(phoneNumber),
    });
  }, []);

  const verifyPhone = useCallback(
    async (phoneNumber: string, code: string) => {
      const axiosInstance = (api as any).axios || (api as any).client?.axiosInstance || (api as any).api || api;
      const response = await axiosInstance.post('/api/auth/verify-phone', {
        phone_number: normalizePhone(phoneNumber),
        code,
      });
      const profileComplete = await handleAuthSuccess(response.data);
      return { profile_complete: profileComplete };
    },
    [handleAuthSuccess]
  );

  const resetPassword = useCallback(async (phoneNumber: string) => {
    const axiosInstance = (api as any).axios || (api as any).client?.axiosInstance || (api as any).api || api;
    const response = await axiosInstance.post('/api/auth/reset-password', {
      phone_number: normalizePhone(phoneNumber),
    });
    return response.data;
  }, []);

  const verifyPasswordReset = useCallback(async (phoneNumber: string, code: string) => {
    const axiosInstance = (api as any).axios || (api as any).client?.axiosInstance || (api as any).api || api;
    const response = await axiosInstance.post('/api/auth/reset-password-verify', {
      phone_number: normalizePhone(phoneNumber),
      code,
    });
    return response.data;
  }, []);

  const confirmPasswordReset = useCallback(async (resetToken: string, newPassword: string) => {
    const axiosInstance = (api as any).axios || (api as any).client?.axiosInstance || (api as any).api || api;
    const response = await axiosInstance.post('/api/auth/reset-password-confirm', {
      reset_token: resetToken,
      new_password: newPassword.trim(),
    });
    await handleAuthSuccess(response.data);
    return response.data;
  }, [handleAuthSuccess]);

  const logout = useCallback(async () => {
    try {
      // Try to call the backend logout endpoint to invalidate refresh tokens
      await api.logout();
    } catch (error) {
      // Even if the backend call fails, we still want to clear local tokens
      // The user is already logged out from the client side
      console.error('Error calling logout endpoint:', error);
    } finally {
      // Always clear local tokens and user state
      await api.clearAuthTokens();
      setUser(null);
      setCurrentUserPlayer(null);
    }
  }, []);

  const value = {
    user,
    currentUserPlayer,
    isAuthenticated: Boolean(user),
    isInitializing,
    fetchCurrentUser,
    loginWithPassword,
    loginWithSms,
    signup,
    sendVerificationCode,
    verifyPhone,
    resetPassword,
    verifyPasswordReset,
    confirmPasswordReset,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

