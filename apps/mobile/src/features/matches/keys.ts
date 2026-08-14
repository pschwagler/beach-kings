import { privateKeys } from '@/infrastructure/query/keys';

export const matchKeys = {
  all: (userId: number) => [...privateKeys.user(userId), 'matches'] as const,
  history: (userId: number, playerId: number | null | undefined) =>
    [...matchKeys.all(userId), 'history', playerId ?? 'none'] as const,
} as const;
