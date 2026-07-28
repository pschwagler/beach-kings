import { queryOptions } from '@tanstack/react-query';
import type { PlayerSearchResponse, Session } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { sessionKeys } from './keys';

const SESSION_STALE_TIME_MS = 30_000;

export const sessionQueries = {
  open: (userId: number, enabled = true) => queryOptions({
    queryKey: sessionKeys.open(userId),
    queryFn: async (): Promise<readonly Session[]> =>
      (await api.getSessions()) ?? [],
    enabled: enabled && userId > 0,
    staleTime: SESSION_STALE_TIME_MS,
    refetchOnWindowFocus: 'always' as const,
  }),

  detail: (userId: number, sessionId: number, enabled = true) => queryOptions({
    queryKey: sessionKeys.detail(userId, sessionId),
    queryFn: () => api.getSessionById(sessionId),
    enabled: enabled && userId > 0 && sessionId > 0,
    staleTime: SESSION_STALE_TIME_MS,
  }),

  playerSearch: (
    userId: number,
    sessionId: number,
    query: string,
    leagueId?: number | null,
    enabled = true,
  ) => {
    const normalizedQuery = query.trim();
    return queryOptions({
      queryKey: sessionKeys.playerSearch(
        userId,
        sessionId,
        normalizedQuery,
        leagueId,
      ),
      queryFn: (): Promise<PlayerSearchResponse> =>
        api.searchPlayers(normalizedQuery, {
          sessionId,
          leagueId,
          limit: 50,
        }),
      enabled: enabled && userId > 0 && sessionId > 0,
      staleTime: 15_000,
    });
  },
};
