/**
 * Data hook for the League Detail orchestrator screen.
 *
 * Fetches the top-level league detail (name, role, stats summary) and
 * manages the active tab state for the 5-tab segment.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { mockApi } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';
import { routes } from '@/lib/navigation';

export type LeagueDetailTab = 'games' | 'standings' | 'chat' | 'signups' | 'info';

export interface UseLeagueDetailScreenResult {
  readonly leagueId: number | string;
  readonly detail: import('@/lib/mockApi').LeagueDetail | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly activeTab: LeagueDetailTab;
  readonly onSetTab: (tab: LeagueDetailTab) => void;
  readonly onInvite: () => void;
  readonly onStartSession: () => void;
  readonly onPressPlayer: (playerId: number | string) => void;
}

/**
 * Returns data and handlers for the League Detail screen orchestrator.
 */
export function useLeagueDetailScreen(
  leagueId: number | string,
): UseLeagueDetailScreenResult {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LeagueDetailTab>('games');

  const detailQuery = useQuery({
    queryKey: leagueKeys.detail(leagueId),
    queryFn: () => mockApi.getLeagueDetail(leagueId), // TODO(backend): GET /api/leagues/:id
  });

  const onSetTab = useCallback((tab: LeagueDetailTab) => {
    setActiveTab(tab);
  }, []);

  const onInvite = useCallback(() => {
    router.push(routes.leagueInvite(leagueId) as never);
  }, [router, leagueId]);

  const onStartSession = useCallback(() => {
    // TODO(backend): navigate to create-session flow with leagueId pre-filled
    router.push(routes.createSession() as never);
  }, [router]);

  const onPressPlayer = useCallback(
    (playerId: number | string) => {
      router.push(routes.player(playerId) as never);
    },
    [router],
  );

  return {
    leagueId,
    detail: detailQuery.data ?? null,
    isLoading: detailQuery.isLoading,
    isError: detailQuery.isError,
    activeTab,
    onSetTab,
    onInvite,
    onStartSession,
    onPressPlayer,
  };
}
