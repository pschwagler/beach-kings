'use client';

import { createContext, useContext, useState, useCallback } from 'react';

const AuthModalContext = createContext(null);

export const AuthModalProvider = ({ children }) => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('sign-in');
  const [onVerifySuccessCallback, setOnVerifySuccessCallback] = useState(null);

  const openAuthModal = useCallback((mode = 'sign-in', onVerifySuccess = null) => {
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

export const useAuthModal = () => {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
};
