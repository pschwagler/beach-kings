/**
 * Data hook for the League Player Stats view.
 *
 * Accessed by tapping a standings row. Shows stats for a specific player
 * in the context of a league/season.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mockApi } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';

export type StatsInnerTab = 'stats' | 'history';

export interface UseLeagueStatsTabResult {
  readonly stats: import('@/lib/mockApi').LeaguePlayerStats | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly innerTab: StatsInnerTab;
  readonly selectedSeasonId: number | null;
  readonly availableSeasons: readonly { id: number; name: string }[];
  readonly onSelectSeason: (id: number) => void;
  readonly onSetInnerTab: (tab: StatsInnerTab) => void;
}

/**
 * Returns data and state for the league player stats view.
 */
export function useLeagueStatsTab(
  leagueId: number | string,
  playerId: number | string,
): UseLeagueStatsTabResult {
  const [innerTab, setInnerTab] = useState<StatsInnerTab>('stats');
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  const statsQuery = useQuery({
    queryKey: leagueKeys.playerStats(leagueId, playerId, selectedSeasonId),
    queryFn: () =>
      mockApi.getLeaguePlayerStats(leagueId, playerId, selectedSeasonId), // TODO(backend): GET /api/leagues/:leagueId/players/:playerId/stats
  });

  const seasonsQuery = useQuery({
    queryKey: leagueKeys.seasons(leagueId),
    queryFn: () => mockApi.getLeagueSeasonsList(leagueId), // TODO(backend): GET /api/leagues/:id/seasons
  });

  const onSelectSeason = useCallback((id: number) => {
    setSelectedSeasonId(id);
  }, []);

  const onSetInnerTab = useCallback((tab: StatsInnerTab) => {
    setInnerTab(tab);
  }, []);

  return {
    stats: statsQuery.data ?? null,
    isLoading: statsQuery.isLoading || seasonsQuery.isLoading,
    isError: statsQuery.isError,
    innerTab,
    selectedSeasonId,
    availableSeasons: seasonsQuery.data ?? [],
    onSelectSeason,
    onSetInnerTab,
  };
}
