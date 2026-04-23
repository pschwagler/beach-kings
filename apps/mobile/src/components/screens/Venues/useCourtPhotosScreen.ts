/**
 * Data hook for the Court Photos gallery screen.
 *
 * Fetches photo list for a given court and manages upload state.
 */

import { useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { CourtPhoto } from '@beach-kings/shared';

export interface UseCourtPhotosScreenResult {
  readonly photos: readonly CourtPhoto[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/**
 * Fetches photos for a court by id or slug.
 *
 * @param idOrSlug - Court numeric id or url slug.
 */
export function useCourtPhotosScreen(
  idOrSlug: number | string,
): UseCourtPhotosScreenResult {
  const { data, isLoading, error, refetch } = useApi<CourtPhoto[]>(
    () => api.getCourtPhotos(idOrSlug),
    [idOrSlug],
  );

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    photos: data ?? [],
    isLoading,
    error,
    isRefreshing: false,
    onRefresh,
    onRetry,
  };
}
