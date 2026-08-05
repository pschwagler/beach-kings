/**
 * Data hook for the Courts list/map screen.
 *
 * Responsibilities:
 *   - Resolves the user's location via the centralized {@link useResolvedUserLocation}
 *     coalescing chain (device GPS -> city -> home court -> hub) and passes those
 *     coordinates to the API for distance-sorted results.
 *   - Fetches the courts list.
 *   - Manages filter/search state.
 *   - Manages list/map view-mode toggle.
 *
 * Filter state (by surface, lighting, free play) lives here so the screen
 * component stays thin.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useResolvedUserLocation } from '@/hooks/useResolvedUserLocation';
import { useAuth } from '@/contexts/AuthContext';
import { courtQueries, isIndoorCourt } from '@/features/courts';
import type { Court } from '@beach-kings/shared';
import { directoryMapRegion, type Region } from '@/utils/mapRegion';

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
  readonly preferredMapRegion: Region;
  readonly isCatalogEmpty: boolean;
  readonly setActiveFilter: (filter: CourtFilterChip | null) => void;
  readonly setSearchQuery: (q: string) => void;
  readonly clearSearch: () => void;
  readonly setViewMode: (mode: CourtsViewMode) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/** Returns filtered/searched courts, view-mode toggle, and location state. */
export function useCourtsScreen(): UseCourtsScreenResult {
  const [activeFilter, setActiveFilter] = useState<CourtFilterChip | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<CourtsViewMode>('list');

  // -------------------------------------------------------------------------
  // Location resolution (device GPS -> city -> home court -> hub)
  // -------------------------------------------------------------------------

  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { coords: userLocation } = useResolvedUserLocation();

  // -------------------------------------------------------------------------
  // Data fetch (re-runs when resolved coordinates change, for distance sort)
  // -------------------------------------------------------------------------

  const {
    data,
    isLoading,
    error,
    isRefetching,
    refetch,
  } = useQuery(
    courtQueries.catalog(userId, userLocation),
  );

  const onRefresh = useCallback(() => {
    void refetch();
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
    if (activeFilter === 'indoor') return isIndoorCourt(court);
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

  const preferredMapRegion = useMemo(
    () => directoryMapRegion(courts, userLocation, searchQuery, activeFilter),
    [courts, userLocation, searchQuery, activeFilter],
  );
  const clearSearch = useCallback(() => setSearchQuery(''), []);

  return {
    courts,
    isLoading,
    error,
    isRefreshing: isRefetching,
    activeFilter,
    searchQuery,
    viewMode,
    userLocation,
    preferredMapRegion,
    isCatalogEmpty: allCourts.length === 0,
    setActiveFilter,
    setSearchQuery,
    clearSearch,
    setViewMode,
    onRefresh,
    onRetry,
  };
}
