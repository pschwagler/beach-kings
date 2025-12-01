import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api, { setAuthTokens, clearAuthTokens, getStoredTokens, logout as logoutApi, getCurrentUserPlayer } from '../services/api';

const AuthContext = createContext(null);

const normalizePhone = (phone) => phone?.trim();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [currentUserPlayer, setCurrentUserPlayer] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await api.get('/api/auth/me');
      setUser(response.data);
      
      // Also fetch the current user's player profile
      try {
        const player = await getCurrentUserPlayer();
        player.first_name = player.nickname ? player.nickname : player.full_name.split(' ')[0];
        setCurrentUserPlayer(player);
      } catch (playerError) {
        // Player might not exist yet, that's okay
        if (playerError.response?.status !== 404) {
          console.error('Error fetching current user player:', playerError);
        }
        setCurrentUserPlayer(null);
      }
    } catch (error) {
      // Only clear tokens on 401 (unauthorized) - don't clear on network errors, 500s, etc.
      const isUnauthorized = error.response?.status === 401;
      if (isUnauthorized) {
        clearAuthTokens();
        setUser(null);
        setCurrentUserPlayer(null);
      } else {
        // For other errors (network, 500, etc.), keep user logged in but log the error
        console.error('Error fetching current user (non-401):', error);
      }
    }
  }, []);

  useEffect(() => {
    const { accessToken, refreshToken } = getStoredTokens();
    if (accessToken && refreshToken) {
      setAuthTokens(accessToken, refreshToken);
      fetchCurrentUser().finally(() => setIsInitializing(false));
    } else {
      clearAuthTokens();
      setIsInitializing(false);
    }
  }, [fetchCurrentUser]);

  const handleAuthSuccess = useCallback(
    async (authResponse) => {
      setAuthTokens(authResponse.access_token, authResponse.refresh_token);
      await fetchCurrentUser();
      // Return profile_complete flag for use in components
      return authResponse.profile_complete !== false;
    },
    [fetchCurrentUser]
  );

  const loginWithPassword = useCallback(
    async (phoneNumber, password) => {
      const response = await api.post('/api/auth/login', {
        phone_number: normalizePhone(phoneNumber),
        password,
      });
      await handleAuthSuccess(response.data);
    },
    [handleAuthSuccess]
  );

  const loginWithSms = useCallback(
    async (phoneNumber, code) => {
      const response = await api.post('/api/auth/sms-login', {
        phone_number: normalizePhone(phoneNumber),
        code,
      });
      await handleAuthSuccess(response.data);
    },
    [handleAuthSuccess]
  );

  const signup = useCallback(async ({ phoneNumber, password, fullName, email }) => {
    const response = await api.post('/api/auth/signup', {
      phone_number: normalizePhone(phoneNumber),
      password: password.trim(),
      full_name: fullName.trim(),
      email: email?.trim() || undefined,
    });
    return response.data;
  }, []);

  const sendVerificationCode = useCallback(async (phoneNumber) => {
    await api.post('/api/auth/send-verification', {
      phone_number: normalizePhone(phoneNumber),
    });
  }, []);

  const verifyPhone = useCallback(
    async (phoneNumber, code) => {
      const response = await api.post('/api/auth/verify-phone', {
        phone_number: normalizePhone(phoneNumber),
        code,
      });
      const profileComplete = await handleAuthSuccess(response.data);
      return { profile_complete: profileComplete };
    },
    [handleAuthSuccess]
  );

  const resetPassword = useCallback(async (phoneNumber) => {
    const response = await api.post('/api/auth/reset-password', {
      phone_number: normalizePhone(phoneNumber),
    });
    return response.data;
  }, []);

  const verifyPasswordReset = useCallback(async (phoneNumber, code) => {
    const response = await api.post('/api/auth/reset-password-verify', {
      phone_number: normalizePhone(phoneNumber),
      code,
    });
    return response.data;
  }, []);

  const confirmPasswordReset = useCallback(async (resetToken, newPassword) => {
    const response = await api.post('/api/auth/reset-password-confirm', {
      reset_token: resetToken,
      new_password: newPassword.trim(),
    });
    // Password reset returns auth tokens, so log the user in automatically
    await handleAuthSuccess(response.data);
    return response.data;
  }, [handleAuthSuccess]);

  const logout = useCallback(async () => {
    try {
      // Try to call the backend logout endpoint to invalidate refresh tokens
      await logoutApi();
    } catch (error) {
      // Even if the backend call fails, we still want to clear local tokens
      // The user is already logged out from the client side
      console.error('Error calling logout endpoint:', error);
    } finally {
      // Always clear local tokens and user state
      clearAuthTokens();
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
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

