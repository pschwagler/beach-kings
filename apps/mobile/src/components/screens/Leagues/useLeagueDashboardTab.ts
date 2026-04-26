/**
 * Data hook for the League Dashboard (Standings) tab.
 *
 * Fetches standings and seasons list; exposes season-picker state.
 * selectedSeasonId:
 *   null  = uninitialised (auto-initialises to latest season on first load)
 *   'all' = aggregate all-time view (no season_id sent to API)
 *   number = specific season
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { Season, LeagueStanding, LeagueSeasonInfo } from '@beach-kings/shared';
import { routes } from '@/lib/navigation';
import { api } from '@/lib/api';
import { leagueKeys } from './leagueKeys';

interface SeasonPickerEntry {
  readonly id: number;
  readonly name: string;
  readonly is_active: boolean;
}

function toSeasonPickerEntry(season: Season): SeasonPickerEntry {
  return {
    id: season.id,
    name: season.name ?? `Season ${season.id}`,
    is_active: season.is_active ?? false,
  };
}

export interface UseLeagueDashboardTabResult {
  readonly standings: readonly LeagueStanding[];
  readonly seasonInfo: LeagueSeasonInfo | null;
  readonly seasons: readonly SeasonPickerEntry[];
  readonly selectedSeasonId: number | 'all' | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onSelectSeason: (id: number | 'all') => void;
  readonly onPressPlayer: (playerId: number) => void;
}

/**
 * Returns all data and state needed by the Standings tab.
 */
export function useLeagueDashboardTab(leagueId: number | string): UseLeagueDashboardTabResult {
  const router = useRouter();
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | 'all' | null>(null);

  const standingsQuery = useQuery({
    queryKey: leagueKeys.standings(leagueId, selectedSeasonId),
    queryFn: () => {
      const seasonId = selectedSeasonId === 'all' || selectedSeasonId === null
        ? undefined
        : selectedSeasonId;
      return api.getLeagueStandings(Number(leagueId), seasonId);
    },
    enabled: selectedSeasonId !== null,
  });

  const seasonsQuery = useQuery({
    queryKey: leagueKeys.seasons(leagueId),
    queryFn: async (): Promise<readonly SeasonPickerEntry[]> => {
      const rows = await api.getLeagueSeasons(Number(leagueId));
      return rows.map(toSeasonPickerEntry);
    },
  });

  // Auto-init: once seasons load, select the latest (first) season if still uninitialised.
  useEffect(() => {
    if (selectedSeasonId === null && seasonsQuery.data && seasonsQuery.data.length > 0) {
      setSelectedSeasonId(seasonsQuery.data[0].id);
    }
  }, [selectedSeasonId, seasonsQuery.data]);

  const onSelectSeason = useCallback((id: number | 'all') => {
    setSelectedSeasonId(id);
  }, []);

  const onPressPlayer = useCallback(
    (playerId: number) => {
      router.push(routes.player(playerId));
    },
    [router],
  );

  const isLoading = seasonsQuery.isLoading || standingsQuery.isLoading;

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
