import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api, { setAuthTokens, clearAuthTokens, getStoredTokens } from '../services/api';

const AuthContext = createContext(null);

const normalizePhone = (phone) => phone?.trim();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await api.get('/api/auth/me');
      setUser(response.data);
    } catch {
      clearAuthTokens();
      setUser(null);
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

  const signup = useCallback(async ({ phoneNumber, password, name, email }) => {
    const response = await api.post('/api/auth/signup', {
      phone_number: normalizePhone(phoneNumber),
      password: password.trim(),
      name: name?.trim() || undefined,
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
      await handleAuthSuccess(response.data);
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

  const logout = useCallback(() => {
    clearAuthTokens();
    setUser(null);
  }, []);

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isInitializing,
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

