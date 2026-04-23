/**
 * Data hook for the King of the Beach (KoB) tournament screen.
 *
 * Fetches the full KobTournamentDetail in a single call. The detail object
 * includes matches[] and standings[] so all three tabs (Live/Schedule/
 * Standings) share the same data — switching tabs does NOT trigger a refetch.
 */

import { useState, useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { KobTournamentDetail } from '@beach-kings/shared';

export type KobTab = 'Live' | 'Schedule' | 'Standings';
export const KOB_TABS: KobTab[] = ['Live', 'Schedule', 'Standings'];

export interface UseKobScreenResult {
  readonly tournament: KobTournamentDetail | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly activeTabIndex: number;
  readonly activeTab: KobTab;
  readonly onTabPress: (index: number) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/**
 * Fetches KoB tournament detail and manages tab state.
 *
 * @param code - Tournament code or numeric id (e.g. "MB2026" or 1).
 */
export function useKobScreen(code: string | number): UseKobScreenResult {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: tournament, isLoading, error, refetch } = useApi<KobTournamentDetail>(
    () => api.getTournament(code),
    [code],
  );

  const onTabPress = useCallback((index: number) => {
    setActiveTabIndex(index);
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
    tournament,
    isLoading,
    error,
    isRefreshing,
    activeTabIndex,
    activeTab: KOB_TABS[activeTabIndex] ?? 'Live',
    onTabPress,
    onRefresh,
    onRetry,
  };
}
