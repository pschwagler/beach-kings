/**
 * App context for mobile app
 * Provides app-wide state like locations
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../services/api';

interface AppContextType {
  locations: any[];
  locationsLoading: boolean;
  locationsError: string | null;
  refreshLocations: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<any[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      const locationsData = await api.getLocations();
      setLocations(locationsData);
    } catch (err: any) {
      console.error('Error loading locations:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to load locations';
      // If it's a network error, provide helpful message
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setLocationsError('Cannot connect to backend. Make sure backend is running (make dev-backend)');
      } else {
        setLocationsError(errorMessage);
      }
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const value = {
    locations,
    locationsLoading,
    locationsError,
    refreshLocations: loadLocations,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
