/**
 * Data hook for the Leagues tab screen.
 * Fetches the current user's player profile and league membership list.
 */

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { League, Player } from '@beach-kings/shared';
import { api } from '@/lib/api';

export const leaguesScreenKeys = {
  root: ['leaguesScreen'] as const,
  leagues: () => [...leaguesScreenKeys.root, 'userLeagues'] as const,
  player: () => [...leaguesScreenKeys.root, 'player'] as const,
};

export interface UseLeaguesScreenResult {
  readonly leagues: readonly League[];
  readonly player: Player | null;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isError: boolean;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/**
 * Returns all data and state needed by the Leagues tab.
 */
export function useLeaguesScreen(): UseLeaguesScreenResult {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const playerQuery = useQuery({
    queryKey: leaguesScreenKeys.player(),
    queryFn: async (): Promise<Player | null> => {
      const result = await api.getCurrentUserPlayer();
      return result ?? null;
    },
  });

  const leaguesQuery = useQuery({
    queryKey: leaguesScreenKeys.leagues(),
    queryFn: async (): Promise<readonly League[]> => {
      const result = await api.getUserLeagues();
      return result ?? [];
    },
  });

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    Promise.all([playerQuery.refetch(), leaguesQuery.refetch()])
      .catch(() => undefined)
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [playerQuery, leaguesQuery]);

  const onRetry = useCallback(() => {
    void playerQuery.refetch();
    void leaguesQuery.refetch();
  }, [playerQuery, leaguesQuery]);

  const isLoading =
    (playerQuery.isLoading || leaguesQuery.isLoading) && !isRefreshing;

  const isError =
    (playerQuery.isError || leaguesQuery.isError) && !isLoading;

  return {
    leagues: leaguesQuery.data ?? [],
    player: playerQuery.data ?? null,
    isLoading,
    isRefreshing,
    isError,
    onRefresh,
    onRetry,
  };
}
