/**
 * Shared hook for the authenticated player's profile.
 *
 * Backed by one user-scoped TanStack Query key so every consumer for an
 * account dedupes onto one in-flight request and one cache entry. Prefer this over
 * calling `api.getCurrentUserPlayer()` ad hoc — it keeps the player profile
 * (city coords, location_id, etc.) consistent across screens.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Player } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { privateKeys } from '@/infrastructure/query/keys';

/** Query-key factory for the current player. */
export const currentPlayerKeys = {
  all: (userId: number) => [...privateKeys.user(userId), 'player'] as const,
  me: (userId: number) => [...currentPlayerKeys.all(userId), 'me'] as const,
  homeCourts: (userId: number, playerId: number) =>
    [...currentPlayerKeys.all(userId), 'home-courts', playerId] as const,
};

/** Fetches (and caches) the authenticated player's profile. */
export function useCurrentPlayer(): UseQueryResult<Player | null, Error> {
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  return useQuery({
    queryKey: currentPlayerKeys.me(userId),
    queryFn: async (): Promise<Player | null> => {
      const result = await api.getCurrentUserPlayer();
      return result ?? null;
    },
    enabled: userId > 0,
  });
}
