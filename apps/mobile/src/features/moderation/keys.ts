import { privateKeys } from '@/infrastructure/query/keys';

export const moderationKeys = {
  all: (userId: number) => [...privateKeys.user(userId), 'moderation'] as const,
  blocks: (userId: number) => [...moderationKeys.all(userId), 'blocks'] as const,
  capabilitiesRoot: (userId: number) =>
    [...moderationKeys.all(userId), 'capabilities'] as const,
  capabilities: (userId: number, playerIds: readonly number[]) =>
    [...moderationKeys.capabilitiesRoot(userId), [...new Set(playerIds)].sort((a, b) => a - b)] as const,
  reports: (userId: number) => [...moderationKeys.all(userId), 'reports'] as const,
  accountStatus: (userId: number) =>
    [...moderationKeys.all(userId), 'account-status'] as const,
};
