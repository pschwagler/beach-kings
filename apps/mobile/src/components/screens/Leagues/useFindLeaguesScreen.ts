/**
 * Data hook for the Find Leagues screen.
 *
 * Manages search query, filter chip state, and the league results query.
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { routes } from "@/lib/navigation";
import { api } from "@/lib/api";
import type { FindLeagueResult } from "@beach-kings/shared";
import useDebounce from "@/hooks/useDebounce";
import { leagueKeys } from "./leagueKeys";
import { useAuth } from "@/contexts/AuthContext";
import {
  getJoinLeagueErrorMessage,
  useJoinLeagueMutation,
} from "@/features/leagues";

export type FindLeaguesFilter =
  | "all"
  | "public"
  | "mens"
  | "womens"
  | "coed"
  | "beginner"
  | "intermediate";

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
  readonly onJoinLeague: (id: number) => Promise<void>;
  readonly requestingIds: ReadonlySet<number>;
  readonly joinError: {
    readonly leagueId: number;
    readonly message: string;
  } | null;
  readonly onCreateLeague: () => void;
}

function filterToParams(filter: FindLeaguesFilter): {
  gender?: string | null;
  level?: string | null;
  is_open?: boolean;
} {
  switch (filter) {
    case "public":
      return { is_open: true };
    case "mens":
      return { gender: "mens" };
    case "womens":
      return { gender: "womens" };
    case "coed":
      return { gender: "coed" };
    case "beginner":
      return { level: "B" };
    case "intermediate":
      return { level: "A" };
    default:
      return {};
  }
}

/**
 * Returns all state and handlers needed by FindLeaguesScreen.
 */
export function useFindLeaguesScreen(): UseFindLeaguesScreenResult {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FindLeaguesFilter>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requestingIds, setRequestingIds] = useState<Set<number>>(new Set());
  const [joinError, setJoinError] = useState<{
    leagueId: number;
    message: string;
  } | null>(null);
  const joinLeague = useJoinLeagueMutation();

  const debouncedSearch = useDebounce(searchQuery, 350);
  const queryParams = {
    q: debouncedSearch || null,
    ...filterToParams(activeFilter),
  };

  const leaguesQuery = useQuery({
    queryKey: leagueKeys.findLeagues(userId, queryParams),
    queryFn: () => api.queryLeagues(queryParams),
    enabled: userId > 0,
  });

  const onChangeSearch = useCallback((v: string) => {
    setJoinError(null);
    setSearchQuery(v);
  }, []);

  const onSelectFilter = useCallback((f: FindLeaguesFilter) => {
    setJoinError(null);
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
      setJoinError(null);
      router.push(routes.league(id));
    },
    [router],
  );

  const onJoinLeague = useCallback(
    async (id: number): Promise<void> => {
      setJoinError(null);
      setRequestingIds((prev) => new Set([...prev, id]));
      try {
        await joinLeague.mutateAsync(id);
      } catch (err) {
        setJoinError({
          leagueId: id,
          message: getJoinLeagueErrorMessage(err),
        });
      } finally {
        setRequestingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [joinLeague],
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
    onJoinLeague,
    requestingIds,
    joinError,
    onCreateLeague,
  };
}
