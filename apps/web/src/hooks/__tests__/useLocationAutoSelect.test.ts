import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  getLocationDistances: vi.fn(),
}));

import { getLocationDistances } from '../../services/api';
import { useLocationAutoSelect } from '../useLocationAutoSelect';

const CITY_DATA = { city: 'San Diego', state: 'CA', city_latitude: 32.7157, city_longitude: -117.1611 };

const LOCATIONS = [
  { id: 'loc-1', name: 'Mission Beach' },
  { id: 'loc-2', name: 'Pacific Beach' },
  { id: 'loc-3', name: 'Coronado' },
];

const DISTANCES_RESPONSE = [
  { id: 'loc-1', distance_miles: 1.2 },
  { id: 'loc-2', distance_miles: 3.5 },
  { id: 'loc-3', distance_miles: 7.8 },
];

describe('useLocationAutoSelect', () => {
  let setFormData;
  let setErrorMessage;

  beforeEach(() => {
    vi.clearAllMocks();
    setFormData = vi.fn();
    setErrorMessage = vi.fn();
  });

  describe('handleCitySelect — immediate setFormData call', () => {
    it('calls setFormData with city/state/lat/lon before API resolves', async () => {
      getLocationDistances.mockResolvedValue(DISTANCES_RESPONSE);

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      // First call is the immediate city/state/coords update
      const firstCall = setFormData.mock.calls[0][0];
      const prevState = { existingField: 'keep' };
      const firstResult = firstCall(prevState);

      expect(firstResult).toEqual({
        existingField: 'keep',
        city: 'San Diego',
        state: 'CA',
        city_latitude: 32.7157,
        city_longitude: -117.1611,
      });
    });
  });

  describe('handleCitySelect — after successful API response', () => {
    it('populates locationDistances map with id→distance_miles', async () => {
      getLocationDistances.mockResolvedValue(DISTANCES_RESPONSE);

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      expect(result.current.locationDistances).toEqual({
        'loc-1': 1.2,
        'loc-2': 3.5,
        'loc-3': 7.8,
      });
    });

    it('enriches locations with distance_miles from the API response', async () => {
      getLocationDistances.mockResolvedValue(DISTANCES_RESPONSE);

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      expect(result.current.locations).toEqual([
        { id: 'loc-1', name: 'Mission Beach', distance_miles: 1.2 },
        { id: 'loc-2', name: 'Pacific Beach', distance_miles: 3.5 },
        { id: 'loc-3', name: 'Coronado', distance_miles: 7.8 },
      ]);
    });

    it('sets distance_miles to undefined for locations not in API response', async () => {
      getLocationDistances.mockResolvedValue([
        { id: 'loc-1', distance_miles: 1.2 },
        // loc-2 and loc-3 absent
      ]);

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      const loc2 = result.current.locations.find((l) => l.id === 'loc-2');
      expect(loc2.distance_miles).toBeUndefined();
    });

    it('auto-selects the closest location (first in sorted API response)', async () => {
      getLocationDistances.mockResolvedValue(DISTANCES_RESPONSE);

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      // Second setFormData call sets location_id and distance_to_location
      const autoSelectCall = setFormData.mock.calls[1][0];
      const prevState = {};
      const autoSelectResult = autoSelectCall(prevState);

      expect(autoSelectResult).toEqual({
        location_id: 'loc-1',
        distance_to_location: 1.2,
      });
    });

    it('casts location_id to string even when API returns a numeric id', async () => {
      getLocationDistances.mockResolvedValue([{ id: 42, distance_miles: 0.5 }]);

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, [{ id: 42, name: 'Test' }]);
      });

      const autoSelectCall = setFormData.mock.calls[1][0];
      expect(autoSelectCall({}).location_id).toBe('42');
    });

    it('does not call setFormData a second time when API returns empty array', async () => {
      getLocationDistances.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      // Only the initial city/state/coords call should have been made
      expect(setFormData).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleCitySelect — API failure', () => {
    it('calls setErrorMessage with a user-facing message on API error', async () => {
      getLocationDistances.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      expect(setErrorMessage).toHaveBeenCalledWith(
        'Failed to find nearby locations. Please try again.'
      );
    });

    it('does not throw when setErrorMessage is null', async () => {
      getLocationDistances.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, null)
      );

      await expect(
        act(async () => {
          await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
        })
      ).resolves.not.toThrow();
    });

    it('does not update locationDistances or locations on API error', async () => {
      getLocationDistances.mockRejectedValue(new Error('timeout'));

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      expect(result.current.locationDistances).toEqual({});
      expect(result.current.locations).toEqual([]);
    });
  });

  describe('handleLocationChange', () => {
    it('calls setFormData with location_id and its distance from the distances map', async () => {
      getLocationDistances.mockResolvedValue(DISTANCES_RESPONSE);

      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      // Populate the distances map first
      await act(async () => {
        await result.current.handleCitySelect(CITY_DATA, LOCATIONS);
      });

      vi.clearAllMocks();

      act(() => {
        result.current.handleLocationChange('loc-2');
      });

      expect(setFormData).toHaveBeenCalledTimes(1);
      const updateFn = setFormData.mock.calls[0][0];
      const updated = updateFn({ other: 'field' });
      expect(updated).toEqual({
        other: 'field',
        location_id: 'loc-2',
        distance_to_location: 3.5,
      });
    });

    it('sets distance_to_location to null for an unknown location id', () => {
      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      act(() => {
        result.current.handleLocationChange('unknown-loc');
      });

      const updateFn = setFormData.mock.calls[0][0];
      const updated = updateFn({});
      expect(updated.distance_to_location).toBeNull();
    });
  });

  describe('updateLocationsWithDistances', () => {
    it('replaces the locations state with the provided array', () => {
      const { result } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      const newLocations = [{ id: 'loc-9', name: 'New Court', distance_miles: 2.0 }];

      act(() => {
        result.current.updateLocationsWithDistances(newLocations);
      });

      expect(result.current.locations).toEqual(newLocations);
    });

    it('is referentially stable across renders', () => {
      const { result, rerender } = renderHook(() =>
        useLocationAutoSelect(setFormData, setErrorMessage)
      );

      const first = result.current.updateLocationsWithDistances;
      rerender();
      expect(result.current.updateLocationsWithDistances).toBe(first);
    });
  });
});
