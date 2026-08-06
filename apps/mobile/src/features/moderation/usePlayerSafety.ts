import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InteractionAction, InteractionCapability } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { moderationQueries } from './queries';
import { useModerationMutations } from './useModerationMutations';

export function usePlayerSafety(playerId: number) {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const query = useQuery(moderationQueries.capabilities(userId, [playerId]));
  const mutations = useModerationMutations();
  const capability: InteractionCapability | undefined =
    query.data?.[String(playerId)];

  return useMemo(() => ({
    capability,
    isPending: query.isPending || mutations.block.isPending || mutations.unblock.isPending,
    isError: query.isError,
    blockedByViewer: capability?.blocked_by_viewer ?? false,
    viewerRestricted: capability?.viewer_restricted ?? false,
    can: (action: InteractionAction) => capability?.actions[action] ?? false,
    block: mutations.block,
    unblock: mutations.unblock,
    refetch: query.refetch,
  }), [capability, mutations.block, mutations.unblock, query.isError, query.isPending, query.refetch]);
}
