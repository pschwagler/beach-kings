/**
 * Data hook for the Tournaments list screen.
 *
 * Fetches tournaments, derives active/upcoming/past sections, and
 * manages filter state.
 */

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import type { KobTournament } from '@beach-kings/shared';

export type TournamentFilter = 'all' | 'kob' | 'bracket' | 'this_week' | 'this_month' | 'open_spots';

export interface UseTournamentsListScreenResult {
  readonly allTournaments: readonly KobTournament[];
  readonly activeTournament: KobTournament | null;
  readonly upcomingTournaments: readonly KobTournament[];
  readonly nearbyTournaments: readonly KobTournament[];
  readonly pastTournaments: readonly KobTournament[];
  readonly filter: TournamentFilter;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly setFilter: (f: TournamentFilter) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onTournamentPress: (id: number) => void;
  readonly onCreatePress: () => void;
}

/** Returns tournaments list data organized into sections. */
export function useTournamentsListScreen(): UseTournamentsListScreenResult {
  const router = useRouter();
  const [filter, setFilter] = useState<TournamentFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useApi<KobTournament[]>(
    () => api.listTournaments(),
    [],
  );

  const allTournaments = data ?? [];

  const activeTournament = useMemo(
    () => allTournaments.find((t) => t.status === 'ACTIVE') ?? null,
    [allTournaments],
  );

  const upcomingTournaments = useMemo(
    () => allTournaments.filter((t) => t.status === 'SETUP'),
    [allTournaments],
  );

  const nearbyTournaments = useMemo(
    () => allTournaments.filter((t) => t.status !== 'CANCELLED'),
    [allTournaments],
  );

  const pastTournaments = useMemo(
    () => allTournaments.filter((t) => t.status === 'COMPLETED'),
    [allTournaments],
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

  const onTournamentPress = useCallback(
    (id: number) => {
      void hapticMedium();
      router.push(routes.tournament(id));
    },
    [router],
  );

  const onCreatePress = useCallback(() => {
    void hapticMedium();
    router.push(routes.createTournament());
  }, [router]);

  return {
    allTournaments,
    activeTournament,
    upcomingTournaments,
    nearbyTournaments,
    pastTournaments,
    filter,
    isLoading,
    error,
    isRefreshing,
    setFilter,
    onRefresh,
    onRetry,
    onTournamentPress,
    onCreatePress,
  };
}
