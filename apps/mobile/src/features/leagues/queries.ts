import {
  infiniteQueryOptions,
  queryOptions,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { leagueKeys } from './keys';

const LEAGUE_GAMES_PAGE_SIZE = 500;

export const leagueQueries = {
  sessions: (
    userId: number,
    leagueId: number | string,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: leagueKeys.sessions(userId, leagueId),
      queryFn: () => api.getLeagueSessions(Number(leagueId)),
      enabled: enabled && userId > 0,
      staleTime: 30_000,
    }),

  allGames: (
    userId: number,
    leagueId: number | string,
    enabled = true,
  ) =>
    infiniteQueryOptions({
      queryKey: leagueKeys.allGames(userId, leagueId),
      queryFn: ({ pageParam }) =>
        api.getLeagueGames(Number(leagueId), {
          limit: LEAGUE_GAMES_PAGE_SIZE,
          offset: pageParam,
        }),
      initialPageParam: 0,
      getNextPageParam: (lastPage, pages) => {
        const loadedCount = pages.reduce(
          (total, page) => total + page.games.length,
          0,
        );
        return lastPage.games.length > 0 && loadedCount < lastPage.total
          ? loadedCount
          : undefined;
      },
      enabled: enabled && userId > 0,
      staleTime: 30_000,
    }),
};
