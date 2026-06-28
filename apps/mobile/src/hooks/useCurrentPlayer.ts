/**
 * Shared hook for the authenticated player's profile.
 *
 * Backed by a single TanStack Query key (`['player', 'me']`) so every consumer
 * dedupes onto one in-flight request and one cache entry. Prefer this over
 * calling `api.getCurrentUserPlayer()` ad hoc — it keeps the player profile
 * (city coords, location_id, etc.) consistent across screens.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Player } from '@beach-kings/shared';
import { api } from '@/lib/api';

/** Query-key factory for the current player. */
export const currentPlayerKeys = {
  me: () => ['player', 'me'] as const,
};

/** Fetches (and caches) the authenticated player's profile. */
export function useCurrentPlayer(): UseQueryResult<Player | null, Error> {
  return useQuery({
    queryKey: currentPlayerKeys.me(),
    queryFn: async (): Promise<Player | null> => {
      const result = await api.getCurrentUserPlayer();
      return result ?? null;
    },
  });
}
