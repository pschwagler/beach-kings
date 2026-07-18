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
import type { Season, LeagueStanding, LeagueSeasonInfo } from '@beach-kings/shared';
import { api } from '@/lib/api';
import useRefreshOnFocus from '@/hooks/useRefreshOnFocus';
import { leagueKeys } from './leagueKeys';
import { defaultSeasonId } from './seasonSelection';
import { useAuth } from '@/contexts/AuthContext';

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
}

/**
 * Returns all data and state needed by the Standings tab.
 */
export function useLeagueDashboardTab(leagueId: number | string): UseLeagueDashboardTabResult {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | 'all' | null>(null);

  const standingsQuery = useQuery({
    queryKey: leagueKeys.standings(userId, leagueId, selectedSeasonId),
    queryFn: () => {
      const seasonId = selectedSeasonId === 'all' || selectedSeasonId === null
        ? undefined
        : selectedSeasonId;
      return api.getLeagueStandings(Number(leagueId), seasonId);
    },
    enabled: userId > 0 && selectedSeasonId !== null,
  });

  const seasonsQuery = useQuery({
    queryKey: leagueKeys.seasons(userId, leagueId),
    queryFn: async (): Promise<readonly SeasonPickerEntry[]> => {
      const rows = await api.getLeagueSeasons(Number(leagueId));
      return rows.map(toSeasonPickerEntry);
    },
    enabled: userId > 0,
  });

  // Auto-init: prefer the API's canonical active season. The list remains
  // newest-first, so its first row is the fallback when no season is active.
  // A league with no seasons uses the all-time view.
  useEffect(() => {
    if (selectedSeasonId === null && seasonsQuery.data) {
      setSelectedSeasonId(defaultSeasonId(seasonsQuery.data));
    }
  }, [selectedSeasonId, seasonsQuery.data]);

  const onSelectSeason = useCallback((id: number | 'all') => {
    setSelectedSeasonId(id);
  }, []);

  // Refetch when the league screen regains focus. Submitting a session (or
  // adding a game) happens on a *pushed* screen while this tab stays mounted
  // underneath, so no remount occurs on return — without this, the standings
  // keep showing pre-submit data until staleTime expires or the app relaunches.
  // Focus fires after the pushed screen pops, i.e. after the backend's async
  // stats-calc job has run, so the refetch reads freshly-computed rows.
  // Cooldown 0: always refresh on focus (the default 30s would suppress the
  // post-submit refetch, since standings were just viewed seconds earlier).
  const refetchOnFocus = useCallback(() => {
    void standingsQuery.refetch();
    void seasonsQuery.refetch();
  }, [standingsQuery.refetch, seasonsQuery.refetch]);
  useRefreshOnFocus(refetchOnFocus, 0);

  // True while the auto-init effect hasn't yet resolved selectedSeasonId.
  // Keeps the loading spinner up until the effect settles to a real id or 'all',
  // preventing a false empty-state flash for zero-season leagues. Excludes the
  // seasons-query-error case: if the seasons fetch failed the effect never runs,
  // so we must fall through to the error state rather than spin forever.
  const isUninitialised = selectedSeasonId === null && !seasonsQuery.isError;

  const isLoading = isUninitialised || seasonsQuery.isLoading || standingsQuery.isLoading;

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
  };
}
