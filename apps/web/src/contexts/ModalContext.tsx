'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

interface ModalContextValue {
  isOpen: boolean;
  modalType: string | null;
  modalProps: Record<string, unknown>;
  openModal: (type: string, props?: Record<string, unknown>) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [modalType, setModalType] = useState<string | null>(null);
  const [modalProps, setModalProps] = useState<Record<string, unknown>>({});

  const openModal = useCallback((type: string, props: Record<string, unknown> = {}) => {
    setModalType(type);
    setModalProps(props);
    setIsOpen(true);
    // Add modal-open class to body for iOS z-index fix
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.body.classList.add('modal-open');
    }
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setModalType(null);
    setModalProps({});
    // Remove modal-open class
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.body.classList.remove('modal-open');
    }
  }, []);

  const value = useMemo(
    () => ({ isOpen, modalType, modalProps, openModal, closeModal }),
    [isOpen, modalType, modalProps, openModal, closeModal],
  );

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};

export const useModal = (): ModalContextValue => {
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
  CREATE_GAME: 'CREATE_GAME',
  SHARE_FALLBACK: 'SHARE_FALLBACK',
  FEEDBACK: 'FEEDBACK',
};
