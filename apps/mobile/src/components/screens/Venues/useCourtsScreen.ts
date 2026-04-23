/**
 * Data hook for the Courts list screen.
 *
 * Fetches the courts list and manages filter/search state.
 * Filter state (by surface, lighting, free play) lives here so the screen
 * component stays thin.
 */

import { useState, useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Court } from '@beach-kings/shared';

export type CourtFilterChip = 'nearby' | 'my-courts' | 'top-rated' | 'indoor' | 'outdoor' | 'lighted';

export interface UseCourtsScreenResult {
  readonly courts: readonly Court[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly activeFilter: CourtFilterChip | null;
  readonly searchQuery: string;
  readonly setActiveFilter: (filter: CourtFilterChip | null) => void;
  readonly setSearchQuery: (q: string) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/** Returns filtered/searched courts and control state for the Courts screen. */
export function useCourtsScreen(): UseCourtsScreenResult {
  const [activeFilter, setActiveFilter] = useState<CourtFilterChip | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useApi<Court[]>(
    () => api.getCourts({}),
    [],
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

  // Apply client-side filter chips
  const filtered = allCourts.filter((court) => {
    if (activeFilter === 'outdoor') return court.surface_type === 'sand';
    if (activeFilter === 'indoor') return court.surface_type === 'indoor';
    if (activeFilter === 'lighted') return court.has_lights === true;
    if (activeFilter === 'top-rated') return (court.average_rating ?? 0) >= 4.0;
    return true;
  });

  // Apply search query
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
    setActiveFilter,
    setSearchQuery,
    onRefresh,
    onRetry,
  };
}
