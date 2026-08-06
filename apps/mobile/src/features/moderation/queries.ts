import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { moderationKeys } from './keys';

export const moderationQueries = {
  blocks: (userId: number) => queryOptions({
    queryKey: moderationKeys.blocks(userId),
    queryFn: () => api.getBlockedPlayers(),
    enabled: userId > 0,
    staleTime: 30_000,
  }),
  capabilities: (userId: number, playerIds: readonly number[]) => {
    const normalizedIds = [...new Set(playerIds)].sort((a, b) => a - b);
    return queryOptions({
      queryKey: moderationKeys.capabilities(userId, normalizedIds),
      queryFn: async () => (
        await api.getInteractionCapabilities(normalizedIds)
      ).capabilities,
      enabled: userId > 0 && normalizedIds.length > 0 && normalizedIds.length <= 100,
      staleTime: 30_000,
    });
  },
  reports: (userId: number) => queryOptions({
    queryKey: moderationKeys.reports(userId),
    queryFn: () => api.getMyReports(),
    enabled: userId > 0,
    staleTime: 30_000,
  }),
  accountStatus: (userId: number) => queryOptions({
    queryKey: moderationKeys.accountStatus(userId),
    queryFn: () => api.getAccountModerationStatus(),
    enabled: userId > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  }),
};
