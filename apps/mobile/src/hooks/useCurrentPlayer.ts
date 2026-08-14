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
import { useAuth } from '@/contexts/AuthContext';
import { playerKeys, playerQueries } from '@/features/player';

/** Query-key factory for the current player. */
export const currentPlayerKeys = playerKeys;

/** Fetches (and caches) the authenticated player's profile. */
export function useCurrentPlayer(): UseQueryResult<Player | null, Error> {
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  return useQuery(playerQueries.me(userId));
}
