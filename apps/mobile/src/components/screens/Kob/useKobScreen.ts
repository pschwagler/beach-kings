/**
 * Data hook for the King of the Beach (KoB) tournament screen.
 *
 * Fetches the full KobTournamentDetail in a single call. The detail object
 * includes matches[] and standings[] so all three tabs (Live/Schedule/
 * Standings) share the same data — switching tabs does NOT trigger a refetch.
 */

import { useState, useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { unavailableTournamentApi } from '@/features/tournaments/unavailableApi';
import type { KobTournamentDetail } from '@beach-kings/shared';

export type KobTab = 'live' | 'schedule' | 'standings';
export const KOB_TABS = [
  { value: 'live', label: 'Live', testID: 'kob-tab-live' },
  { value: 'schedule', label: 'Schedule', testID: 'kob-tab-schedule' },
  { value: 'standings', label: 'Standings', testID: 'kob-tab-standings' },
] as const satisfies readonly { value: KobTab; label: string; testID: string }[];

export interface UseKobScreenResult {
  readonly tournament: KobTournamentDetail | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly activeTab: KobTab;
  readonly onTabChange: (tab: KobTab) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

/**
 * Fetches KoB tournament detail and manages tab state.
 *
 * @param code - Tournament code or numeric id (e.g. "MB2026" or 1).
 */
export function useKobScreen(code: string | number): UseKobScreenResult {
  const [activeTab, setActiveTab] = useState<KobTab>('live');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: tournament, isLoading, error, refetch } = useApi<KobTournamentDetail>(
    () => unavailableTournamentApi.getTournament(code),
    [code],
  );

  const onTabChange = useCallback((tab: KobTab) => {
    setActiveTab(tab);
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
    activeTab,
    onTabChange,
    onRefresh,
    onRetry,
  };
}
