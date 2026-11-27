import { isAccessRevokedError } from '@/lib/apiError';
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
import type { FindLeagueResult, LeaguePictureThumbnails } from "@beach-kings/shared";
import { useLeaguePictureThumbnails } from "@/features/leagues/useLeaguePictureThumbnails";
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
  readonly pictures: LeaguePictureThumbnails;
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
  const [requestingIds, setRequestingIds] = useState<Set<number>>(new Set());
  const [joinError, setJoinError] = useState<{
    leagueId: number;
    message: string;
  } | null>(null);
  const joinLeague = useJoinLeagueMutation();

  const debouncedSearch = useDebounce(searchQuery, 350);
  const queryParams = {
    q: debouncedSearch || null,
    include_joined: true,
    ...filterToParams(activeFilter),
  };

  const leaguesQuery = useQuery({
    queryKey: leagueKeys.findLeagues(userId, queryParams),
    queryFn: ({ signal }) => api.queryLeagues(queryParams, { signal }),
    enabled: userId > 0,
  });

  const leagues = leaguesQuery.data?.items ?? [];
  const { pictures, refreshPictures } = useLeaguePictureThumbnails(
    userId,
    leagues.filter(({ user_status }) => user_status === "member").map(({ id }) => id),
  );

  const onChangeSearch = useCallback((v: string) => {
    setJoinError(null);
    setSearchQuery(v);
  }, []);

  const onSelectFilter = useCallback((f: FindLeaguesFilter) => {
    setJoinError(null);
    setActiveFilter(f);
  }, []);

  const onRefresh = useCallback(() => Promise.all([
    leaguesQuery.refetch({ cancelRefetch: false }),
    refreshPictures(),
  ]), [leaguesQuery, refreshPictures]);

  const onRetry = useCallback(() => {
    void leaguesQuery.refetch({ cancelRefetch: false });
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

  const isLoading = leaguesQuery.isLoading;

  const isError = leaguesQuery.isError && (leaguesQuery.data === undefined || isAccessRevokedError(leaguesQuery.error)) && !isLoading;

  return {
    searchQuery,
    activeFilter,
    leagues,
    pictures,
    isLoading,
    isRefreshing: false,
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
