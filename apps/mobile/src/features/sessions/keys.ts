import { privateKeys } from '@/infrastructure/query/keys';

export const sessionKeys = {
  all: (userId: number) => [...privateKeys.user(userId), 'sessions'] as const,
  open: (userId: number) => [...sessionKeys.all(userId), 'open'] as const,
  detail: (userId: number, sessionId: number) =>
    [...sessionKeys.all(userId), 'detail', sessionId] as const,
} as const;
