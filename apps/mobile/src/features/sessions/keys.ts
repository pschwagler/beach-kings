import { privateKeys } from '@/infrastructure/query/keys';

export const sessionKeys = {
  all: (userId: number) => [...privateKeys.user(userId), 'sessions'] as const,
  open: (userId: number) => [...sessionKeys.all(userId), 'open'] as const,
  detail: (userId: number, sessionId: number) =>
    [...sessionKeys.all(userId), 'detail', sessionId] as const,
  participants: (userId: number, sessionId: number) =>
    [...sessionKeys.detail(userId, sessionId), 'participants'] as const,
  playerSearchRoot: (userId: number, sessionId: number | null) =>
    [...sessionKeys.all(userId), 'player-search', sessionId] as const,
  playerSearch: (
    userId: number,
    sessionId: number | null,
    query: string,
    leagueId?: number | null,
  ) =>
    [
      ...sessionKeys.playerSearchRoot(userId, sessionId),
      leagueId ?? null,
      query,
    ] as const,
} as const;
