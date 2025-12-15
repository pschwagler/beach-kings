/**
 * Modal context for mobile app
 * React Native compatible modal management
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ModalContextType {
  isOpen: boolean;
  modalType: string | null;
  modalProps: Record<string, any>;
  openModal: (type: string, props?: Record<string, any>) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [modalType, setModalType] = useState<string | null>(null);
  const [modalProps, setModalProps] = useState<Record<string, any>>({});

  const openModal = useCallback((type: string, props: Record<string, any> = {}) => {
    setModalType(type);
    setModalProps(props);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setModalType(null);
    setModalProps({});
  }, []);

  const value = {
    isOpen,
    modalType,
    modalProps,
    openModal,
    closeModal,
  };

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}

// Modal Types Constants
export const MODAL_TYPES = {
  CREATE_LEAGUE: 'CREATE_LEAGUE',
  PLAYER_PROFILE: 'PLAYER_PROFILE',
  ADD_MATCH: 'ADD_MATCH',
  EDIT_SCHEDULE: 'EDIT_SCHEDULE',
  SIGNUP: 'SIGNUP',
  CONFIRMATION: 'CONFIRMATION',
};



