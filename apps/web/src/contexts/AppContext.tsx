'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { getLocations, getUserLeagues } from '../services/api';
import type { Location, League } from '../types';
import { useAuth } from './AuthContext';

interface AppContextValue {
  locations: Location[];
  locationsLoading: boolean;
  locationsError: string | null;
  refreshLocations: () => Promise<void>;
  userLeagues: League[];
  leaguesLoading: boolean;
  refreshLeagues: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState<boolean>(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  const [userLeagues, setUserLeagues] = useState<League[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState<boolean>(false);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      const locationsData = await getLocations();
      setLocations(locationsData);
    } catch (err) {
      console.error('Error loading locations:', err);
      setLocationsError((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Failed to load locations');
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  const loadLeagues = useCallback(async () => {
    if (!isAuthenticated) {
      setUserLeagues([]);
      return;
    }
    setLeaguesLoading(true);
    try {
      const leagues = await getUserLeagues();
      setUserLeagues(Array.isArray(leagues) ? leagues : []);
    } catch (err) {
      console.error('Error loading user leagues:', err);
      setUserLeagues([]);
    } finally {
      setLeaguesLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    loadLeagues();
  }, [loadLeagues]);

  const value = useMemo(() => ({
    locations,
    locationsLoading,
    locationsError,
    refreshLocations: loadLocations,
    userLeagues,
    leaguesLoading,
    refreshLeagues: loadLeagues,
  }), [locations, locationsLoading, locationsError, loadLocations, userLeagues, leaguesLoading, loadLeagues]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
