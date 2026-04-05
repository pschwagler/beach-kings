'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { getLocations } from '../services/api';
import type { Location } from '../types';

interface AppContextValue {
  locations: Location[];
  locationsLoading: boolean;
  locationsError: string | null;
  refreshLocations: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState<boolean>(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      const locationsData = await getLocations();
      setLocations(locationsData);
    } catch (err) {
      console.error('Error loading locations:', err);
      setLocationsError(err.response?.data?.detail || 'Failed to load locations');
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const value = useMemo(() => ({
    locations,
    locationsLoading,
    locationsError,
    refreshLocations: loadLocations,
  }), [locations, locationsLoading, locationsError, loadLocations]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
