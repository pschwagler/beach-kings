'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface DrawerContextValue {
  isOpen: boolean;
  drawerType: string | null;
  drawerProps: Record<string, unknown>;
  openDrawer: (type: string, props?: Record<string, unknown>) => void;
  closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export const DrawerProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [drawerType, setDrawerType] = useState<string | null>(null);
  const [drawerProps, setDrawerProps] = useState<Record<string, unknown>>({});

  const openDrawer = useCallback((type: string, props: Record<string, unknown> = {}) => {
    setDrawerType(type);
    setDrawerProps(props);
    setIsOpen(true);
    // Add drawer-open class to body for iOS z-index fix
    if (typeof document !== 'undefined') {
      document.body.classList.add('drawer-open');
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setDrawerType(null);
    setDrawerProps({});
    // Remove drawer-open class
    if (typeof document !== 'undefined') {
      document.body.classList.remove('drawer-open');
    }
  }, []);

  const value = {
    isOpen,
    drawerType,
    drawerProps,
    openDrawer,
    closeDrawer,
  };

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
};

export const useDrawer = (): DrawerContextValue => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider');
  }
  return context;
};

// Drawer Types Constants
export const DRAWER_TYPES = {
  PLAYER_DETAILS: 'PLAYER_DETAILS',
};
