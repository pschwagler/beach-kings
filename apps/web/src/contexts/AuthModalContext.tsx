'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export type AuthMode =
  | 'sign-in'
  | 'sign-up'
  | 'sms-login'
  | 'verify'
  | 'reset-password'
  | 'reset-password-code'
  | 'reset-password-new';

interface AuthModalContextValue {
  isAuthModalOpen: boolean;
  authModalMode: AuthMode;
  openAuthModal: (mode?: AuthMode, onVerifySuccess?: (() => void) | null) => void;
  closeAuthModal: () => void;
  handleVerifySuccess: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export const AuthModalProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>('sign-in');
  const [onVerifySuccessCallback, setOnVerifySuccessCallback] = useState<(() => void) | null>(null);

  const openAuthModal = useCallback((mode: AuthMode = 'sign-in', onVerifySuccess: (() => void) | null = null) => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
    setOnVerifySuccessCallback(() => onVerifySuccess);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setOnVerifySuccessCallback(null);
  }, []);

  const handleVerifySuccess = useCallback(() => {
    if (onVerifySuccessCallback) {
      onVerifySuccessCallback();
    }
  }, [onVerifySuccessCallback]);

  const value = {
    isAuthModalOpen,
    authModalMode,
    openAuthModal,
    closeAuthModal,
    handleVerifySuccess,
  };

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
};

export const useAuthModal = (): AuthModalContextValue => {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
};
