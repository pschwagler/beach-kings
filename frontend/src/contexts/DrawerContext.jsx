import { createContext, useContext, useState, useCallback } from 'react';

const DrawerContext = createContext(null);

export const DrawerProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [drawerType, setDrawerType] = useState(null);
  const [drawerProps, setDrawerProps] = useState({});

  const openDrawer = useCallback((type, props = {}) => {
    setDrawerType(type);
    setDrawerProps(props);
    setIsOpen(true);
    // Add drawer-open class to body for iOS z-index fix
    document.body.classList.add('drawer-open');
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setDrawerType(null);
    setDrawerProps({});
    // Remove drawer-open class
    document.body.classList.remove('drawer-open');
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

export const useDrawer = () => {
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
