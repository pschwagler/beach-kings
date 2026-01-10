/**
 * Auth modal context for mobile app
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AuthModalContextType {
  isAuthModalOpen: boolean;
  authModalMode: 'sign-in' | 'sign-up';
  openAuthModal: (mode?: 'sign-in' | 'sign-up', onVerifySuccess?: () => void) => void;
  closeAuthModal: () => void;
  handleVerifySuccess: () => void;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [onVerifySuccessCallback, setOnVerifySuccessCallback] = useState<(() => void) | null>(null);

  const openAuthModal = useCallback((mode: 'sign-in' | 'sign-up' = 'sign-in', onVerifySuccess?: () => void) => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
    setOnVerifySuccessCallback(() => onVerifySuccess || null);
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
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
}

