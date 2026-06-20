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

interface SeasonSelectorEntry {
  readonly id: number;
  readonly name: string;
}

function toSeasonSelectorEntry(season: Season): SeasonSelectorEntry {
  return {
    id: season.id,
    name: season.name ?? `Season ${season.id}`,
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
  const [innerTab, setInnerTab] = useState<StatsInnerTab>('stats');
  // Internal state uses 'all' as a sentinel for the all-time (no season_id) view.
  // The public interface maps 'all' back to null so callers remain stable.
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | 'all' | null>(null);

  const seasonsQuery = useQuery({
    queryKey: leagueKeys.seasons(leagueId),
    queryFn: async (): Promise<readonly SeasonSelectorEntry[]> => {
      const rows = await api.getLeagueSeasons(Number(leagueId));
      return rows.map(toSeasonSelectorEntry);
    },
  });

  // Auto-init: once seasons resolve, select the latest (first) season so the
  // API call matches the visually highlighted pill, or fall back to 'all'
  // (all-time) when the league has no seasons yet.
  useEffect(() => {
    if (selectedSeasonId === null && seasonsQuery.data) {
      setSelectedSeasonId(
        seasonsQuery.data.length > 0 ? seasonsQuery.data[0].id : 'all',
      );
    }
  }, [selectedSeasonId, seasonsQuery.data]);

  // Resolve the season_id to pass to the API: 'all' sentinel maps to null
  // which the API treats as "no season filter" (all-time).
  const apiSeasonId = selectedSeasonId === 'all' ? null : selectedSeasonId;

  const statsQuery = useQuery({
    queryKey: leagueKeys.playerStats(leagueId, playerId, apiSeasonId),
    queryFn: () =>
      api.getLeaguePlayerStats(
        Number(leagueId),
        Number(playerId),
        apiSeasonId,
      ),
    enabled: selectedSeasonId !== null,
  });

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
    isLoading: statsQuery.isLoading || seasonsQuery.isLoading,
    isError: statsQuery.isError,
    innerTab,
    // Map internal 'all' sentinel back to null for the stable public interface.
    selectedSeasonId: selectedSeasonId === 'all' ? null : selectedSeasonId,
    availableSeasons: seasonsQuery.data ?? [],
    onSelectSeason,
    onSetInnerTab,
  };
}
