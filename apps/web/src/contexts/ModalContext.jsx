'use client';

import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext(null);

export const ModalProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [modalProps, setModalProps] = useState({});

  const openModal = useCallback((type, props = {}) => {
    console.log('[ModalContext] openModal called - type:', type, 'props keys:', Object.keys(props));
    setModalType(type);
    setModalProps(props);
    setIsOpen(true);
    // Add modal-open class to body for iOS z-index fix
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.body.classList.add('modal-open');
    }
  }, []);

  const closeModal = useCallback(() => {
    console.log('[ModalContext] closeModal called');
    setIsOpen(false);
    setModalType(null);
    setModalProps({});
    // Remove modal-open class
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.body.classList.remove('modal-open');
    }
  }, []);

  const value = {
    isOpen,
    modalType,
    modalProps,
    openModal,
    closeModal,
  };

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

// Modal Types Constants
export const MODAL_TYPES = {
  CREATE_LEAGUE: 'CREATE_LEAGUE',
  PLAYER_PROFILE: 'PLAYER_PROFILE',
  ADD_MATCH: 'ADD_MATCH',
  EDIT_SCHEDULE: 'EDIT_SCHEDULE',
  SIGNUP: 'SIGNUP',
  CONFIRMATION: 'CONFIRMATION', // Optional, if we want to use it globally
  SESSION_SUMMARY: 'SESSION_SUMMARY',
  UPLOAD_PHOTO: 'UPLOAD_PHOTO',
  REVIEW_PHOTO_MATCHES: 'REVIEW_PHOTO_MATCHES',
};
