/**
 * Data hook for the Court Detail screen.
 *
 * Fetches court details by id/slug and manages check-in state.
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { courtQueries } from '@/features/courts';
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
  const { user } = useAuth();
  const { data: court, isLoading, error, isRefetching, refetch } = useQuery(
    courtQueries.detail(user?.id ?? 0, idOrSlug),
  );

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
    isRefreshing: isRefetching,
    onRefresh,
    onRetry,
  };
}
