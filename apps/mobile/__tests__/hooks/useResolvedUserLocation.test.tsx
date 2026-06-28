/**
 * Tests for useResolvedUserLocation — the centralized 4-tier location resolver.
 *
 * Validates the priority chain: device GPS -> city -> home court -> hub, and
 * that the deeper fallbacks are NOT fetched when city coords are present.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getCurrentUserPlayer: jest.fn(),
    getPlayerHomeCourts: jest.fn(),
    getLocations: jest.fn(),
  },
}));

import * as ExpoLocation from 'expo-location';
import { api } from '@/lib/api';
import { useResolvedUserLocation } from '@/hooks/useResolvedUserLocation';

const mockPermission = ExpoLocation.requestForegroundPermissionsAsync as jest.Mock;
const mockPosition = ExpoLocation.getCurrentPositionAsync as jest.Mock;
const mockApi = api as unknown as {
  getCurrentUserPlayer: jest.Mock;
  getPlayerHomeCourts: jest.Mock;
  getLocations: jest.Mock;
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockPermission.mockReset();
  mockPosition.mockReset();
  mockApi.getCurrentUserPlayer.mockReset();
  mockApi.getPlayerHomeCourts.mockReset();
  mockApi.getLocations.mockReset();
  // Sensible defaults; individual tests override.
  mockApi.getPlayerHomeCourts.mockResolvedValue([]);
  mockApi.getLocations.mockResolvedValue([]);
});

describe('useResolvedUserLocation', () => {
  it('prefers device GPS over every profile source', async () => {
    mockPermission.mockResolvedValue({ status: 'granted' });
    mockPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    mockApi.getCurrentUserPlayer.mockResolvedValue({
      id: 7,
      city_latitude: 50,
      city_longitude: 60,
    });

    const { result } = renderHook(() => useResolvedUserLocation(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.source).toBe('device'));
    expect(result.current.coords).toEqual({ latitude: 1, longitude: 2 });
  });

  it('falls back to city coords when GPS is denied, without fetching deeper tiers', async () => {
    mockPermission.mockResolvedValue({ status: 'denied' });
    mockApi.getCurrentUserPlayer.mockResolvedValue({
      id: 7,
      city_latitude: 32.78,
      city_longitude: -117.23,
      location_id: 'socal_sd',
    });

    const { result } = renderHook(() => useResolvedUserLocation(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.source).toBe('city'));
    expect(result.current.coords).toEqual({ latitude: 32.78, longitude: -117.23 });
    expect(mockApi.getPlayerHomeCourts).not.toHaveBeenCalled();
    expect(mockApi.getLocations).not.toHaveBeenCalled();
  });

  it('falls back to the #1 home court when there are no city coords', async () => {
    mockPermission.mockResolvedValue({ status: 'denied' });
    mockApi.getCurrentUserPlayer.mockResolvedValue({ id: 7, location_id: null });
    mockApi.getPlayerHomeCourts.mockResolvedValue([
      { id: 5, latitude: 33.99, longitude: -118.48, position: 0 },
      { id: 6, latitude: 34.01, longitude: -118.5, position: 1 },
    ]);

    const { result } = renderHook(() => useResolvedUserLocation(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.source).toBe('home_court'));
    expect(result.current.coords).toEqual({ latitude: 33.99, longitude: -118.48 });
  });

  it('falls back to the location hub when no city or home-court coords exist', async () => {
    mockPermission.mockResolvedValue({ status: 'denied' });
    mockApi.getCurrentUserPlayer.mockResolvedValue({ id: 7, location_id: 'socal_la' });
    mockApi.getPlayerHomeCourts.mockResolvedValue([]); // no home courts
    mockApi.getLocations.mockResolvedValue([
      { id: 'socal_sd', latitude: 32.7, longitude: -117.1 },
      { id: 'socal_la', latitude: 34.05, longitude: -118.24 },
    ]);

    const { result } = renderHook(() => useResolvedUserLocation(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.source).toBe('hub'));
    expect(result.current.coords).toEqual({ latitude: 34.05, longitude: -118.24 });
  });

  it('resolves to null when no source is available', async () => {
    mockPermission.mockResolvedValue({ status: 'denied' });
    mockApi.getCurrentUserPlayer.mockResolvedValue({ id: 7, location_id: null });
    mockApi.getPlayerHomeCourts.mockResolvedValue([]);

    const { result } = renderHook(() => useResolvedUserLocation(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.coords).toBeNull();
    expect(result.current.source).toBeNull();
  });
});
