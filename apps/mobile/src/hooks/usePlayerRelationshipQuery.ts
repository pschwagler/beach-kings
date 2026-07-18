import { useQuery } from '@tanstack/react-query';
import type { FriendshipStatus } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { socialQueryKeys } from '@/lib/socialQueryKeys';

export interface PlayerRelationship {
  readonly status: FriendshipStatus;
  readonly request_id: number | null;
}

interface BatchRelationshipResponse {
  readonly statuses?: Readonly<Record<string, FriendshipStatus>>;
  readonly relationships?: Readonly<Record<string, {
    readonly status?: FriendshipStatus;
    readonly request_id?: number | null;
  }>>;
}

export function normalizePlayerRelationship(
  response: BatchRelationshipResponse | null | undefined,
  playerId: number,
): PlayerRelationship {
  const key = String(playerId);
  const relationship = response?.relationships?.[key];
  return {
    status: relationship?.status ?? response?.statuses?.[key] ?? 'none',
    request_id: relationship?.request_id ?? null,
  };
}

/** Canonical, user-scoped relationship state for a viewed player. */
export function usePlayerRelationshipQuery(playerId: number) {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  return useQuery({
    queryKey: socialQueryKeys.relationship(userId, playerId),
    queryFn: async () => normalizePlayerRelationship(
      await api.batchFriendStatus([playerId]),
      playerId,
    ),
    enabled: isAuthenticated && userId !== 0 && playerId > 0,
  });
}
