import { useState } from 'react';
import { getLocationDistances } from '../services/api';

/**
 * Custom hook for automatically selecting the closest location when a city is selected.
 * Returns state and handlers for managing location distances and auto-selection.
 */
export function useLocationAutoSelect(setFormData, setErrorMessage) {
  const [locationDistances, setLocationDistances] = useState({}); // Map of location_id -> distance
  const [locations, setLocations] = useState([]);

  /**
   * Handle city selection - automatically find and select the closest location
   */
  const handleCitySelect = async (cityData, currentLocations) => {
    // Store city data
    setFormData((prev) => ({
      ...prev,
      city: cityData.city,
      state: cityData.state,
      city_latitude: cityData.lat,
      city_longitude: cityData.lon,
    }));

    // Get distances to all locations
    try {
      const locationsWithDistances = await getLocationDistances(cityData.lat, cityData.lon);
      
      // Store distances in a map for easy lookup
      const distancesMap = {};
      locationsWithDistances.forEach(loc => {
        distancesMap[loc.id] = loc.distance_miles;
      });
      setLocationDistances(distancesMap);

      // Update locations list with distances for display
      // Merge the API response (which has distances) with the full location data
      const locationsWithDistancesForDisplay = currentLocations.map(loc => {
        const distanceInfo = locationsWithDistances.find(l => l.id === loc.id);
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
  };

  /**
   * Handle location change - update distance from stored distances map
   */
  const handleLocationChange = (locationId) => {
    const distance = locationDistances[locationId];
    setFormData((prev) => ({
      ...prev,
      location_id: locationId,
      distance_to_location: distance !== undefined ? distance : null,
    }));
  };

  /**
   * Update locations list (for when locations are loaded separately)
   * This should be called when locations are initially loaded
   */
  const updateLocationsWithDistances = (newLocations) => {
    setLocations(newLocations);
  };

  return {
    locations,
    locationDistances,
    handleCitySelect,
    handleLocationChange,
    updateLocationsWithDistances,
  };
}
