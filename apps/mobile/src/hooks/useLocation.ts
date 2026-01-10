/**
 * Hook for managing location services
 */

import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

interface LocationData {
  latitude: number;
  longitude: number;
}

export function useLocation() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          setIsLoading(false);
          return;
        }

        const locationData = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: locationData.coords.latitude,
          longitude: locationData.coords.longitude,
        });
      } catch (error) {
        setErrorMsg('Error getting location');
        console.error('Location error:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return { location, errorMsg, isLoading };
}

