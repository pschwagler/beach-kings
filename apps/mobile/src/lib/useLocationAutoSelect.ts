/**
 * Mobile port of `apps/web/src/hooks/useLocationAutoSelect.ts`.
 *
 * Adapted for react-hook-form: instead of owning form state, the hook
 * invokes `onLocationSelect(locationId)` when the closest location is
 * resolved so the caller can forward it to `setValue('locationId', …)`.
 *
 * Flow:
 *   1. Caller renders `CityAutocomplete`; user picks a suggestion.
 *   2. Caller invokes `handleCitySelect({ lat, lon })`.
 *   3. Hook calls `/api/locations/distances`, sorts, merges distances
 *      into the loaded location list so the picker labels can show
 *      "City, ST (X mi)", and auto-selects the closest.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Location } from '@beach-kings/shared';
import { api } from './api';

export interface CityCoords {
  readonly lat: number;
  readonly lon: number;
}

export interface LocationWithDistance extends Location {
  readonly distance_miles?: number | null;
}

interface UseLocationAutoSelectOptions {
  readonly locations: readonly Location[];
  readonly onLocationSelect: (locationId: string) => void;
}

export function useLocationAutoSelect({
  locations,
  onLocationSelect,
}: UseLocationAutoSelectOptions) {
  const [locationsWithDistance, setLocationsWithDistance] = useState<
    readonly LocationWithDistance[]
  >(locations);

  // Reflect caller-provided list until distances have been computed.
  useEffect(() => {
    setLocationsWithDistance((prev) => {
      const alreadyRanked = prev.some((l) => l.distance_miles != null);
      return alreadyRanked ? prev : locations;
    });
  }, [locations]);

  const handleCitySelect = useCallback(
    async ({ lat, lon }: CityCoords) => {
      try {
        const ranked = await api.getLocationDistances(lat, lon);
        const byId = new Map(ranked.map((r) => [r.id, r.distance_miles ?? null]));
        const merged: readonly LocationWithDistance[] = locations.map((loc) => ({
          ...loc,
          distance_miles: byId.get(loc.id) ?? null,
        }));
        setLocationsWithDistance(merged);
        if (ranked.length > 0) {
          onLocationSelect(String(ranked[0].id));
        }
      } catch {
        // Leave state untouched; user can still pick manually.
      }
    },
    [locations, onLocationSelect],
  );

  return {
    locationsWithDistance,
    handleCitySelect,
  };
}
