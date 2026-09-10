import { privateKeys } from '@/infrastructure/query/keys';

export const matchKeys = {
  all: (userId: number) => [...privateKeys.user(userId), 'matches'] as const,
  history: (userId: number, playerId: number | null | undefined) =>
    [...matchKeys.all(userId), 'history', playerId ?? 'none'] as const,
  myGames: (userId: number, leagueId: number | null, result?: 'W' | 'L') =>
    [...matchKeys.all(userId), 'my-games', { leagueId, result: result ?? null }] as const,
} as const;
