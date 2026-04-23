/**
 * Data hook for the Court Detail screen.
 *
 * Fetches court details by id/slug and manages check-in state.
 */

import { useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Court } from '@beach-kings/shared';

export interface UseCourtDetailScreenResult {
  readonly court: Court | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/**
 * Fetches a court by id or slug and returns loading/error state.
 *
 * @param idOrSlug - Court numeric id or url slug.
 */
export function useCourtDetailScreen(
  idOrSlug: number | string,
): UseCourtDetailScreenResult {
  const { data: court, isLoading, error, refetch, mutate: _mutate } = useApi<Court>(
    () => api.getCourtById(idOrSlug),
    [idOrSlug],
  );

  const isRefreshing = false;

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    court,
    isLoading,
    error,
    isRefreshing,
    onRefresh,
    onRetry,
  };
}
