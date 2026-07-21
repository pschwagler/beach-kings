import { privateKeys } from '@/infrastructure/query/keys';

export const playerKeys = {
  all: (userId: number) => [...privateKeys.user(userId), 'player'] as const,
  me: (userId: number) => [...playerKeys.all(userId), 'me'] as const,
  homeCourts: (userId: number, playerId: number) =>
    [...playerKeys.all(userId), 'home-courts', playerId] as const,
} as const;
