/**
 * Data hook for the League Dashboard (Standings) tab.
 *
 * Fetches standings and seasons list; exposes season-picker state.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { routes } from '@/lib/navigation';
import { mockApi } from '@/lib/mockApi';
import type { LeagueStanding, LeagueSeasonInfo } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';

export interface UseLeagueDashboardTabResult {
  readonly standings: readonly LeagueStanding[];
  readonly seasonInfo: LeagueSeasonInfo | null;
  readonly seasons: readonly { id: number; name: string; is_active: boolean }[];
  readonly selectedSeasonId: number | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onSelectSeason: (id: number) => void;
  readonly onPressPlayer: (playerId: number) => void;
}

/**
 * Returns all data and state needed by the Standings tab.
 */
export function useLeagueDashboardTab(leagueId: number | string): UseLeagueDashboardTabResult {
  const router = useRouter();
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  const standingsQuery = useQuery({
    queryKey: leagueKeys.standings(leagueId, selectedSeasonId),
    queryFn: () =>
      mockApi.getLeagueStandings(leagueId, selectedSeasonId), // TODO(backend): GET /api/leagues/:id/standings
  });

  const seasonsQuery = useQuery({
    queryKey: leagueKeys.seasons(leagueId),
    queryFn: () => mockApi.getLeagueSeasonsList(leagueId), // TODO(backend): GET /api/leagues/:id/seasons
  });

  const onSelectSeason = useCallback((id: number) => {
    setSelectedSeasonId(id);
  }, []);

  const onPressPlayer = useCallback(
    (playerId: number) => {
      router.push(routes.player(playerId));
    },
    [router],
  );

  const isLoading =
    (standingsQuery.isLoading || seasonsQuery.isLoading) &&
    !standingsQuery.isFetching;

  const isError =
    (standingsQuery.isError || seasonsQuery.isError) && !isLoading;

  return {
    standings: standingsQuery.data?.standings ?? [],
    seasonInfo: standingsQuery.data?.season_info ?? null,
    seasons: seasonsQuery.data ?? [],
    selectedSeasonId,
    isLoading,
    isError,
    onSelectSeason,
    onPressPlayer,
  };
}
