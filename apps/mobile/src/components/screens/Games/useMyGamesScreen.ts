/**
 * Data hook for the My Games screen.
 *
 * Fetches the current user's game history list with filter support.
 * Filter state (by league and by result) lives here so the screen
 * component stays thin.
 */

import { useState, useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { GameHistoryEntry, MyGamesResponse } from '@beach-kings/shared';

export type ResultFilter = 'all' | 'W' | 'L' | 'D';

export interface UseMyGamesScreenResult {
  readonly games: readonly GameHistoryEntry[];
  readonly total: number;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly leagueFilter: number | null;
  readonly resultFilter: ResultFilter;
  readonly setLeagueFilter: (id: number | null) => void;
  readonly setResultFilter: (r: ResultFilter) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/**
 * Returns data and filter state for the My Games screen.
 */
export function useMyGamesScreen(): UseMyGamesScreenResult {
  const [leagueFilter, setLeagueFilter] = useState<number | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const params = {
    league_id: leagueFilter ?? undefined,
    result: resultFilter === 'all' ? undefined : resultFilter,
  };

  const { data, isLoading, error, refetch } = useApi<MyGamesResponse>(
    () => api.getMyGames(params),
    [leagueFilter, resultFilter],
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

  return {
    games: data?.games ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    isRefreshing,
    leagueFilter,
    resultFilter,
    setLeagueFilter,
    setResultFilter,
    onRefresh,
    onRetry,
  };
}
