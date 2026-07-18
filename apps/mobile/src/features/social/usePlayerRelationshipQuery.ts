import { useQuery } from '@tanstack/react-query';
import type { FriendshipRelationship, FriendshipStatus } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { socialQueries } from './queries';

interface BatchRelationshipResponse {
  readonly statuses?: Readonly<Record<string, FriendshipStatus>>;
  readonly relationships?: Readonly<Record<string, FriendshipRelationship>>;
}

export function normalizePlayerRelationship(
  response: BatchRelationshipResponse | null | undefined,
  playerId: number,
): FriendshipRelationship {
  return response?.relationships?.[String(playerId)] ?? {
    status: response?.statuses?.[String(playerId)] ?? 'none',
    request_id: null,
  };
}

/** Canonical, user-scoped relationship state for a viewed player. */
export function usePlayerRelationshipQuery(playerId: number) {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  return useQuery(socialQueries.relationship(userId, playerId, isAuthenticated));
}
