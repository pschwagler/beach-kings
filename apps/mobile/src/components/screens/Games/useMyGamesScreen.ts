/**
 * Data hook for the My Games screen.
 *
 * W/L filtering is server-side. Partner and opponent filtering is
 * client-side — the backend returns all games and we filter locally
 * using the partner_names / opponent_names arrays on each entry.
 */

import { useState, useCallback, useMemo } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { GameHistoryEntry, MyGamesResponse } from '@beach-kings/shared';

export type ResultFilter = 'all' | 'W' | 'L' | 'partner' | 'opponent';

export interface UseMyGamesScreenResult {
  readonly games: readonly GameHistoryEntry[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly leagueFilter: number | null;
  readonly resultFilter: ResultFilter;
  readonly selectedPartner: string | null;
  readonly selectedOpponent: string | null;
  readonly availablePartners: readonly string[];
  readonly availableOpponents: readonly string[];
  readonly setLeagueFilter: (id: number | null) => void;
  readonly setResultFilter: (r: ResultFilter) => void;
  readonly setSelectedPartner: (name: string | null) => void;
  readonly setSelectedOpponent: (name: string | null) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

export function useMyGamesScreen(): UseMyGamesScreenResult {
  const [leagueFilter, setLeagueFilter] = useState<number | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Only W/L are sent to the API — partner/opponent are handled client-side
  const apiResult =
    resultFilter === 'W' || resultFilter === 'L' ? resultFilter : undefined;

  const { data, isLoading, error, refetch } = useApi<MyGamesResponse>(
    () => api.getMyGames({ league_id: leagueFilter ?? undefined, result: apiResult }),
    [leagueFilter, apiResult],
  );

  const allGames = useMemo(() => data?.games ?? [], [data]);

  const availablePartners = useMemo((): readonly string[] => {
    const names = new Set<string>();
    allGames.forEach((g) => g.partner_names.forEach((n) => names.add(n)));
    return [...names].sort();
  }, [allGames]);

  const availableOpponents = useMemo((): readonly string[] => {
    const names = new Set<string>();
    allGames.forEach((g) => g.opponent_names.forEach((n) => names.add(n)));
    return [...names].sort();
  }, [allGames]);

  const filteredGames = useMemo((): readonly GameHistoryEntry[] => {
    if (resultFilter === 'partner' && selectedPartner != null) {
      return allGames.filter((g) => g.partner_names.includes(selectedPartner));
    }
    if (resultFilter === 'opponent' && selectedOpponent != null) {
      return allGames.filter((g) => g.opponent_names.includes(selectedOpponent));
    }
    return allGames;
  }, [allGames, resultFilter, selectedPartner, selectedOpponent]);

  // Changing the primary result filter clears any sub-selection
  const handleSetResultFilter = useCallback((r: ResultFilter) => {
    setResultFilter(r);
    setSelectedPartner(null);
    setSelectedOpponent(null);
  }, []);

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
    games: filteredGames,
    isLoading,
    error,
    isRefreshing,
    leagueFilter,
    resultFilter,
    selectedPartner,
    selectedOpponent,
    availablePartners,
    availableOpponents,
    setLeagueFilter,
    setResultFilter: handleSetResultFilter,
    setSelectedPartner,
    setSelectedOpponent,
    onRefresh,
    onRetry,
  };
}
