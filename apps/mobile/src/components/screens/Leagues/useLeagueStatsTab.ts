/**
 * Data hook for the League Player Stats view.
 *
 * Accessed by tapping a standings row. Shows stats for a specific player
 * in the context of a league/season.
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LeaguePlayerStats, Season } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { leagueKeys } from './leagueKeys';
import { defaultSeasonId } from './seasonSelection';
import { useAuth } from '@/contexts/AuthContext';

interface SeasonSelectorEntry {
  readonly id: number;
  readonly name: string;
  readonly is_active: boolean;
}

function toSeasonSelectorEntry(season: Season): SeasonSelectorEntry {
  return {
    id: season.id,
    name: season.name ?? `Season ${season.id}`,
    is_active: season.is_active ?? false,
  };
}

export type StatsInnerTab = 'stats' | 'history';

export interface UseLeagueStatsTabResult {
  readonly stats: LeaguePlayerStats | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly innerTab: StatsInnerTab;
  /**
   * The currently selected season id, or null when viewing all-time stats
   * (either because the league has no seasons, or the user selected all-time).
   * Callers should not distinguish between "no selection yet" and "all-time".
   */
  readonly selectedSeasonId: number | null;
  readonly availableSeasons: readonly { id: number; name: string }[];
  readonly onSelectSeason: (id: number) => void;
  readonly onSetInnerTab: (tab: StatsInnerTab) => void;
}

/**
 * Returns data and state for the league player stats view.
 *
 * Backed by GET /api/leagues/:leagueId/players/:playerId/stats[?season_id=].
 * ``rank``, ``rating_delta``, and ``game_history`` are placeholders until the
 * backend computes them — the UI handles the empty/null values gracefully.
 */
export function useLeagueStatsTab(
  leagueId: number | string,
  playerId: number | string,
): UseLeagueStatsTabResult {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [innerTab, setInnerTab] = useState<StatsInnerTab>('stats');
  // Internal state uses 'all' as a sentinel for the all-time (no season_id) view.
  // The public interface maps 'all' back to null so callers remain stable.
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | 'all' | null>(null);

  const seasonsQuery = useQuery({
    queryKey: leagueKeys.seasons(userId, leagueId),
    queryFn: async (): Promise<readonly SeasonSelectorEntry[]> => {
      const rows = await api.getLeagueSeasons(Number(leagueId));
      return rows.map(toSeasonSelectorEntry);
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

  // Resolve the season_id to pass to the API: 'all' sentinel maps to null
  // which the API treats as "no season filter" (all-time).
  const apiSeasonId = selectedSeasonId === 'all' ? null : selectedSeasonId;

  const statsQuery = useQuery({
    queryKey: leagueKeys.playerStats(userId, leagueId, playerId, apiSeasonId),
    queryFn: () =>
      api.getLeaguePlayerStats(
        Number(leagueId),
        Number(playerId),
        apiSeasonId,
      ),
    enabled: userId > 0 && selectedSeasonId !== null,
  });

  // True while the auto-init effect hasn't yet resolved selectedSeasonId.
  // Keeps the loading spinner up until the effect settles to a real id or 'all',
  // preventing a false error/empty-state flash for zero-season leagues. Excludes
  // the seasons-query-error case: if the seasons fetch failed the effect never
  // runs, so we must surface the error rather than spin forever.
  const isUninitialised = selectedSeasonId === null && !seasonsQuery.isError;

  // The Stats sub-view is per-season by design: its SeasonSelector renders only
  // season pills (no "All" pill) and hides entirely for <=1 season. So
  // onSelectSeason accepts only a concrete season id. The 'all' (all-time)
  // sentinel is reachable solely via the zero-season auto-init above, where the
  // selector is hidden and all-time is the only meaningful view.
  const onSelectSeason = useCallback((id: number) => {
    setSelectedSeasonId(id);
  }, []);

  const onSetInnerTab = useCallback((tab: StatsInnerTab) => {
    setInnerTab(tab);
  }, []);

  return {
    stats: statsQuery.data ?? null,
    isLoading: isUninitialised || statsQuery.isLoading || seasonsQuery.isLoading,
    isError: statsQuery.isError || seasonsQuery.isError,
    innerTab,
    // Map internal 'all' sentinel back to null for the stable public interface.
    selectedSeasonId: selectedSeasonId === 'all' ? null : selectedSeasonId,
    availableSeasons: seasonsQuery.data ?? [],
    onSelectSeason,
    onSetInnerTab,
  };
}
