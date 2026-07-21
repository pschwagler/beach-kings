import { queryOptions } from '@tanstack/react-query';
import type { Session } from '@beach-kings/shared';
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
};
