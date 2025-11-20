import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getLocations } from '../services/api';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState(null);

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

  const value = {
    locations,
    locationsLoading,
    locationsError,
    refreshLocations: loadLocations,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

