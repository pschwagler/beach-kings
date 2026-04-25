/**
 * Data hook for the My Stats screen.
 *
 * Fetches the current user's aggregate stats with filter support
 * (time window and league filter). The partners/opponents toggle
 * is purely UI state — all data is fetched together.
 */

import { useState, useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { MyStatsPayload } from '@beach-kings/shared';

export type TimeFilter = '30d' | '90d' | '1y' | 'all';
export type BreakdownTab = 'partners' | 'opponents';

export interface UseMyStatsScreenResult {
  readonly stats: MyStatsPayload | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly timeFilter: TimeFilter;
  readonly leagueFilter: number | null;
  readonly breakdownTab: BreakdownTab;
  readonly setTimeFilter: (t: TimeFilter) => void;
  readonly setLeagueFilter: (id: number | null) => void;
  readonly setBreakdownTab: (tab: BreakdownTab) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

function timeToDays(t: TimeFilter): number | null {
  switch (t) {
    case '30d': return 30;
    case '90d': return 90;
    case '1y': return 365;
    default: return null;
  }
}

/**
 * Returns data and filter state for the My Stats screen.
 */
export function useMyStatsScreen(): UseMyStatsScreenResult {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [leagueFilter, setLeagueFilter] = useState<number | null>(null);
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>('partners');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const params = {
    league_id: leagueFilter,
    days: timeToDays(timeFilter),
  };

  const { data, isLoading, error, refetch } = useApi<MyStatsPayload>(
    () => api.getMyStats(params),
    [timeFilter, leagueFilter],
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
    stats: data ?? null,
    isLoading,
    error,
    isRefreshing,
    timeFilter,
    leagueFilter,
    breakdownTab,
    setTimeFilter,
    setLeagueFilter,
    setBreakdownTab,
    onRefresh,
    onRetry,
  };
}
