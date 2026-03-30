import { useState, useCallback } from 'react';
import { getLocationDistances } from '../services/api';
import type { Location } from '../types';

interface CityData {
  city: string;
  state: string;
  city_latitude: number | null;
  city_longitude: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic form updater, callers use their own specific form types
type FormUpdater = (updater: (prev: any) => any) => void;

/**
 * Custom hook for automatically selecting the closest location when a city is selected.
 * Returns state and handlers for managing location distances and auto-selection.
 */
export function useLocationAutoSelect(
  setFormData: FormUpdater,
  setErrorMessage: ((msg: string) => void) | null,
) {
  const [locationDistances, setLocationDistances] = useState<Record<string, number>>({}); // Map of location_id -> distance
  const [locations, setLocations] = useState<Location[]>([]);

  /**
   * Handle city selection - automatically find and select the closest location
   */
  const handleCitySelect = useCallback(async (cityData: CityData, currentLocations: Location[]) => {
    // Store city data
    setFormData((prev: Record<string, unknown>) => ({
      ...prev,
      city: cityData.city,
      state: cityData.state,
      city_latitude: cityData.city_latitude,
      city_longitude: cityData.city_longitude,
    }));

    // Get distances to all locations
    if (cityData.city_latitude == null || cityData.city_longitude == null) return;
    try {
      const locationsWithDistances = await getLocationDistances(cityData.city_latitude, cityData.city_longitude);
      
      // Store distances in a map for easy lookup
      const distancesMap: Record<string, number> = {};
      locationsWithDistances.forEach((loc: Location) => {
        distancesMap[loc.id] = loc.distance_miles ?? 0;
      });
      setLocationDistances(distancesMap);

      // Update locations list with distances for display
      // Merge the API response (which has distances) with the full location data
      const locationsWithDistancesForDisplay = currentLocations.map((loc: Location) => {
        const distanceInfo = locationsWithDistances.find((l: Location) => l.id === loc.id);
        return {
          ...loc,
          distance_miles: distanceInfo ? distanceInfo.distance_miles : undefined
        };
      });
      setLocations(locationsWithDistancesForDisplay);

      // Auto-select the closest location (first in sorted array)
      if (locationsWithDistances.length > 0) {
        const closestLocation = locationsWithDistances[0];
        setFormData((prev) => ({
          ...prev,
          location_id: String(closestLocation.id),
          distance_to_location: closestLocation.distance_miles,
        }));
      }
    } catch (error) {
      console.error('Error getting location distances:', error);
      if (setErrorMessage) {
        setErrorMessage('Failed to find nearby locations. Please try again.');
      }
    }
  }, [setFormData, setErrorMessage]);

  /**
   * Handle location change - update distance from stored distances map
   */
  const handleLocationChange = useCallback((locationId: string) => {
    const distance = locationDistances[locationId];
    setFormData((prev) => ({
      ...prev,
      location_id: locationId,
      distance_to_location: distance !== undefined ? distance : null,
    }));
  }, [locationDistances, setFormData]);

  /**
   * Update locations list (for when locations are loaded separately)
   * This should be called when locations are initially loaded
   */
  const updateLocationsWithDistances = useCallback((newLocations: Location[]) => {
    setLocations(newLocations);
  }, []);

  return {
    locations,
    locationDistances,
    handleCitySelect,
    handleLocationChange,
    updateLocationsWithDistances,
  };
}
