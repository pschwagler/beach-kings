/**
 * Drawer context for mobile app
 * For bottom sheets and side drawers
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface DrawerContextType {
  isOpen: boolean;
  drawerType: string | null;
  drawerProps: Record<string, any>;
  openDrawer: (type: string, props?: Record<string, any>) => void;
  closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextType | undefined>(undefined);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<string | null>(null);
  const [drawerProps, setDrawerProps] = useState<Record<string, any>>({});

  const openDrawer = useCallback((type: string, props: Record<string, any> = {}) => {
    setDrawerType(type);
    setDrawerProps(props);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setDrawerType(null);
    setDrawerProps({});
  }, []);

  const value = {
    isOpen,
    drawerType,
    drawerProps,
    openDrawer,
    closeDrawer,
  };

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer() {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider');
  }
  return context;
}

// Drawer Types Constants
export const DRAWER_TYPES = {
  PLAYER_DETAILS: 'PLAYER_DETAILS',
};
