import { isAccessRevokedError } from '@/lib/apiError';
/**
 * Data hook for the Leagues tab screen.
 * Fetches the current user's player profile and league membership list.
 */

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { League, LeaguePictureThumbnails, Player } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentPlayer } from '@/hooks/useCurrentPlayer';
import { useLeaguePictureThumbnails } from '@/features/leagues/useLeaguePictureThumbnails';
import { leagueKeys } from './leagueKeys';

export interface UseLeaguesScreenResult {
  readonly leagues: readonly League[];
  readonly pictures: LeaguePictureThumbnails;
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
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  const playerQuery = useCurrentPlayer();

  const leaguesQuery = useQuery({
    queryKey: leagueKeys.userLeagues(userId),
    queryFn: async ({ signal }): Promise<readonly League[]> => {
      const result = await api.getUserLeagues({ signal });
      return result ?? [];
    },
    enabled: userId > 0,
  });

  const leagues = leaguesQuery.data ?? [];
  const { pictures, refreshPictures } = useLeaguePictureThumbnails(
    userId,
    leagues.map(({ id }) => id),
  );
  const onRefresh = useCallback(() => Promise.all([
    playerQuery.refetch({ cancelRefetch: false }),
    leaguesQuery.refetch({ cancelRefetch: false }),
    refreshPictures(),
  ]), [playerQuery, leaguesQuery, refreshPictures]);

  const onRetry = useCallback(() => {
    void playerQuery.refetch({ cancelRefetch: false });
    void leaguesQuery.refetch({ cancelRefetch: false });
  }, [playerQuery, leaguesQuery]);

  const isLoading =
    playerQuery.isLoading || leaguesQuery.isLoading;

  const isError =
    ((playerQuery.isError && (playerQuery.data === undefined || isAccessRevokedError(playerQuery.error)))
      || (leaguesQuery.isError && (leaguesQuery.data === undefined || isAccessRevokedError(leaguesQuery.error)))) && !isLoading;

  return {
    leagues,
    pictures,
    player: playerQuery.data ?? null,
    isLoading,
    isRefreshing: false,
    isError,
    onRefresh,
    onRetry,
  };
}
