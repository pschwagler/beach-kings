/**
 * Data hook for the Courts list/map screen.
 *
 * Responsibilities:
 *   - Fetches the courts list (passing lat/lon when permission is granted, for
 *     distance-sorted results).
 *   - Manages filter/search state.
 *   - Manages list/map view-mode toggle.
 *   - Requests foreground location permission via `expo-location`; falls back
 *     gracefully when denied or unavailable (list still shows, map uses
 *     bounding-box of all pins).
 *
 * Filter state (by surface, lighting, free play) lives here so the screen
 * component stays thin.
 */

import { useState, useCallback, useEffect } from 'react';
import * as ExpoLocation from 'expo-location';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Court } from '@beach-kings/shared';

export type CourtFilterChip = 'nearby' | 'my-courts' | 'top-rated' | 'indoor' | 'outdoor' | 'lighted';

/** Which mode the courts screen shows. */
export type CourtsViewMode = 'list' | 'map';

export interface UserCoords {
  readonly latitude: number;
  readonly longitude: number;
}

export interface UseCourtsScreenResult {
  readonly courts: readonly Court[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly activeFilter: CourtFilterChip | null;
  readonly searchQuery: string;
  readonly viewMode: CourtsViewMode;
  readonly userLocation: UserCoords | null;
  readonly setActiveFilter: (filter: CourtFilterChip | null) => void;
  readonly setSearchQuery: (q: string) => void;
  readonly setViewMode: (mode: CourtsViewMode) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/** Returns filtered/searched courts, view-mode toggle, and location state. */
export function useCourtsScreen(): UseCourtsScreenResult {
  const [activeFilter, setActiveFilter] = useState<CourtFilterChip | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<CourtsViewMode>('list');
  const [userLocation, setUserLocation] = useState<UserCoords | null>(null);

  // -------------------------------------------------------------------------
  // Location permission + lookup
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function requestLocation(): Promise<void> {
      // Any location failure (denied permission, services off, timeout) is
      // non-fatal: the screen falls back to the no-location court list below.
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        const position = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });

        if (cancelled) return;

        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        // Swallow: userLocation stays null and getCourts() runs without coords.
      }
    }

    void requestLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Data fetch (re-runs when userLocation becomes available)
  // -------------------------------------------------------------------------

  const { data, isLoading, error, refetch } = useApi<Court[]>(
    () =>
      api.getCourts(
        userLocation != null
          ? { lat: userLocation.latitude, lon: userLocation.longitude }
          : {},
      ),
    [userLocation],
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => {
      setIsRefreshing(false);
    });
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const allCourts: readonly Court[] = Array.isArray(data) ? data : [];

  // -------------------------------------------------------------------------
  // Client-side filtering
  // -------------------------------------------------------------------------

  const filtered = allCourts.filter((court) => {
    if (activeFilter === 'my-courts') return court.is_saved === true;
    if (activeFilter === 'outdoor') return court.surface_type === 'sand';
    if (activeFilter === 'indoor') return court.surface_type === 'indoor';
    if (activeFilter === 'lighted') return court.has_lights === true;
    if (activeFilter === 'top-rated') return (court.average_rating ?? 0) >= 4.0;
    return true;
  });

  const q = searchQuery.toLowerCase().trim();
  const courts = q.length === 0
    ? filtered
    : filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.city?.toLowerCase().includes(q) ?? false) ||
          (c.address?.toLowerCase().includes(q) ?? false),
      );

  return {
    courts,
    isLoading,
    error,
    isRefreshing,
    activeFilter,
    searchQuery,
    viewMode,
    userLocation,
    setActiveFilter,
    setSearchQuery,
    setViewMode,
    onRefresh,
    onRetry,
  };
}
