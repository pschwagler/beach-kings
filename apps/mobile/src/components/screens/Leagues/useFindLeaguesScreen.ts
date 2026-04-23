/**
 * Data hook for the Find Leagues screen.
 *
 * Manages search query, filter chip state, and the league results query.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { routes } from '@/lib/navigation';
import { mockApi } from '@/lib/mockApi';
import type { FindLeagueResult, LeagueAccessType } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';

export type FindLeaguesFilter = 'all' | 'public' | 'mens' | 'womens' | 'coed' | 'beginner' | 'intermediate';

export interface UseFindLeaguesScreenResult {
  readonly searchQuery: string;
  readonly activeFilter: FindLeaguesFilter;
  readonly leagues: readonly FindLeagueResult[];
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isError: boolean;
  readonly onChangeSearch: (v: string) => void;
  readonly onSelectFilter: (f: FindLeaguesFilter) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onPressLeague: (id: number) => void;
  readonly onRequestJoin: (id: number) => Promise<void>;
  readonly requestingIds: ReadonlySet<number>;
  readonly onCreateLeague: () => void;
}

function filterToParams(
  filter: FindLeaguesFilter,
): {
  gender?: string | null;
  level?: string | null;
  access_type?: LeagueAccessType | null;
} {
  switch (filter) {
    case 'public':
      return { access_type: 'open' };
    case 'mens':
      return { gender: 'mens' };
    case 'womens':
      return { gender: 'womens' };
    case 'coed':
      return { gender: 'coed' };
    case 'beginner':
      return { level: 'B' };
    case 'intermediate':
      return { level: 'A' };
    default:
      return {};
  }
}

/**
 * Returns all state and handlers needed by FindLeaguesScreen.
 */
export function useFindLeaguesScreen(): UseFindLeaguesScreenResult {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FindLeaguesFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requestingIds, setRequestingIds] = useState<Set<number>>(new Set());

  const queryParams = {
    query: searchQuery || null,
    ...filterToParams(activeFilter),
  };

  const leaguesQuery = useQuery({
    queryKey: leagueKeys.findLeagues(queryParams),
    queryFn: () => mockApi.findLeagues(queryParams), // TODO(backend): GET /api/leagues/find
  });

  const onChangeSearch = useCallback((v: string) => {
    setSearchQuery(v);
  }, []);

  const onSelectFilter = useCallback((f: FindLeaguesFilter) => {
    setActiveFilter(f);
  }, []);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void leaguesQuery.refetch().finally(() => setIsRefreshing(false));
  }, [leaguesQuery]);

  const onRetry = useCallback(() => {
    void leaguesQuery.refetch();
  }, [leaguesQuery]);

  const onPressLeague = useCallback(
    (id: number) => {
      router.push(routes.league(id));
    },
    [router],
  );

  const onRequestJoin = useCallback(
    async (id: number): Promise<void> => {
      setRequestingIds((prev) => new Set([...prev, id]));
      try {
        await mockApi.requestToJoinLeague(id); // TODO(backend): POST /api/leagues/:id/join-request
      } finally {
        setRequestingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  const onCreateLeague = useCallback(() => {
    router.push(routes.createLeague());
  }, [router]);

  const isLoading =
    (leaguesQuery.isLoading || leaguesQuery.isFetching) && !isRefreshing;

  const isError = leaguesQuery.isError && !isLoading;

  return {
    searchQuery,
    activeFilter,
    leagues: leaguesQuery.data ?? [],
    isLoading,
    isRefreshing,
    isError,
    onChangeSearch,
    onSelectFilter,
    onRefresh,
    onRetry,
    onPressLeague,
    onRequestJoin,
    requestingIds,
    onCreateLeague,
  };
}
