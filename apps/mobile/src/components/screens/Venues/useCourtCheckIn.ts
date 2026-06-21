/**
 * useCourtCheckIn — check-in state + action for a single court.
 *
 * On mount, fetches the current active check-ins for the given court and
 * derives whether the current player is already checked in. The `checkIn()`
 * action posts to the backend, triggers haptic feedback, and refetches the
 * live count. No check-out — relies on the backend's 4-hour auto-expiry.
 *
 * @param court - The court object (used for its `slug` / `id`).
 * @param currentPlayerId - The signed-in player's id, or null if not authenticated.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import type { Court, CheckedInPlayer } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UseCourtCheckInResult {
  /** Number of players currently checked in (live after mount). */
  readonly count: number;
  /** True when the current player is already checked in at this court. */
  readonly isCheckedIn: boolean;
  /** True while the initial check-in list is loading. */
  readonly isLoading: boolean;
  /** True while a check-in POST is in flight. */
  readonly isSubmitting: boolean;
  /** Any error from either the fetch or the check-in action. */
  readonly error: Error | null;
  /**
   * Trigger a one-shot check-in for the current player.
   * No-ops gracefully when `currentPlayerId` is null.
   */
  readonly checkIn: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches live check-in data for a court and exposes a `checkIn()` action.
 *
 * The court identifier used for the GET is `court.slug ?? court.id` so that
 * public, slug-based URLs work without requiring a numeric id.
 */
export function useCourtCheckIn(
  court: Court,
  currentPlayerId: number | null,
): UseCourtCheckInResult {
  const idOrSlug = court.slug ?? court.id;

  const [count, setCount] = useState(0);
  const [checkedInPlayers, setCheckedInPlayers] = useState<
    readonly CheckedInPlayer[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Fetch current check-ins
  // -------------------------------------------------------------------------

  const fetchCheckIns = useCallback(async (): Promise<void> => {
    try {
      const response = await api.getCourtCheckIns(idOrSlug);
      if (mountedRef.current) {
        setCount(response.count);
        setCheckedInPlayers(response.checked_in_players);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [idOrSlug]);

  useEffect(() => {
    setIsLoading(true);
    void fetchCheckIns();
  }, [fetchCheckIns]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const isCheckedIn =
    currentPlayerId != null &&
    checkedInPlayers.some((p) => p.player_id === currentPlayerId);

  // -------------------------------------------------------------------------
  // checkIn action
  // -------------------------------------------------------------------------

  const checkIn = useCallback(async (): Promise<void> => {
    if (currentPlayerId == null) return;

    void hapticMedium();
    setIsSubmitting(true);
    setError(null);

    try {
      await api.checkInToCourt(court.id as number);
      // Refetch to get the updated live count and player list.
      await fetchCheckIns();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, [currentPlayerId, court.id, fetchCheckIns]);

  return {
    count,
    isCheckedIn,
    isLoading,
    isSubmitting,
    error,
    checkIn,
  };
}
