/**
 * Data hook for the Find Leagues screen.
 *
 * Manages search query, filter chip state, and the league results query.
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { routes } from '@/lib/navigation';
import { api } from '@/lib/api';
import type { FindLeagueResult, LeagueQueryResponse } from '@beach-kings/shared';
import useDebounce from '@/hooks/useDebounce';
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
  is_open?: boolean;
} {
  switch (filter) {
    case 'public':
      return { is_open: true };
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
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FindLeaguesFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requestingIds, setRequestingIds] = useState<Set<number>>(new Set());

  const debouncedSearch = useDebounce(searchQuery, 350);
  const queryParams = {
    q: debouncedSearch || null,
    ...filterToParams(activeFilter),
  };

  const leaguesQuery = useQuery({
    queryKey: leagueKeys.findLeagues(queryParams),
    queryFn: () => api.queryLeagues(queryParams),
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
      queryClient.setQueriesData<LeagueQueryResponse>(
        { queryKey: [...leagueKeys.root, 'find'] },
        (old) =>
          old
            ? { ...old, items: old.items.map((l) => l.id === id ? { ...l, user_status: 'requested' as const } : l) }
            : old,
      );
      try {
        await api.requestToJoinLeague(id);
      } catch (err) {
        void queryClient.invalidateQueries({ queryKey: [...leagueKeys.root, 'find'] });
        throw err;
      } finally {
        setRequestingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [queryClient],
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
    leagues: leaguesQuery.data?.items ?? [],
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
