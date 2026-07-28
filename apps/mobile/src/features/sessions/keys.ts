import { privateKeys } from '@/infrastructure/query/keys';

export const sessionKeys = {
  all: (userId: number) => [...privateKeys.user(userId), 'sessions'] as const,
  open: (userId: number) => [...sessionKeys.all(userId), 'open'] as const,
  detail: (userId: number, sessionId: number) =>
    [...sessionKeys.all(userId), 'detail', sessionId] as const,
  playerSearch: (
    userId: number,
    sessionId: number,
    query: string,
    leagueId?: number | null,
  ) =>
    [
      ...sessionKeys.detail(userId, sessionId),
      'player-search',
      leagueId ?? null,
      query,
    ] as const,
} as const;
