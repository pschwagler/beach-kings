/**
 * useSaveCourt — save/unsave ("My Courts") state + toggle action for a single court.
 *
 * Mirrors the structure of useCourtCheckIn:
 *   - mountedRef guard to prevent setState after unmount
 *   - hapticMedium on toggle
 *   - Optimistic update with revert-on-error
 *   - No fetch on mount — initialises from court.is_saved
 *
 * @param court - The court object; `is_saved` seeds the initial state.
 * @param currentPlayerId - The signed-in player's id, or null if not authenticated.
 * @param onChanged - Optional callback fired after a successful save/unsave.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import type { Court } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UseSaveCourtResult {
  /** Whether the current player has saved this court. */
  readonly isSaved: boolean;
  /** True while a save/unsave request is in flight. */
  readonly isSubmitting: boolean;
  /** Any error from the most recent toggle attempt. */
  readonly error: Error | null;
  /**
   * Toggle the saved state. No-ops when currentPlayerId is null.
   * Optimistically updates state and reverts on error.
   */
  readonly toggle: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the "My Courts" saved state for a single court.
 *
 * Derives initial state from `court.is_saved` and keeps it in sync with
 * prop changes (e.g. when the parent refetches court data). Does NOT fetch
 * on mount — the parent is responsible for providing current `is_saved`.
 */
export function useSaveCourt(
  court: Court,
  currentPlayerId: number | null,
  onChanged?: () => void,
): UseSaveCourtResult {
  const [isSaved, setIsSaved] = useState<boolean>(court.is_saved ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Re-sync when the parent updates court.is_saved (e.g. after a refetch).
  useEffect(() => {
    setIsSaved(court.is_saved ?? false);
  }, [court.is_saved]);

  // -------------------------------------------------------------------------
  // toggle action
  // -------------------------------------------------------------------------

  const toggle = useCallback(async (): Promise<void> => {
    if (currentPlayerId == null) return;

    const previousSaved = isSaved;
    const nextSaved = !previousSaved;

    void hapticMedium();

    // Optimistic update
    setIsSaved(nextSaved);
    setIsSubmitting(true);
    setError(null);

    try {
      const courtId = Number(court.id);
      if (nextSaved) {
        await api.saveCourt(courtId);
      } else {
        await api.unsaveCourt(courtId);
      }
      onChanged?.();
    } catch (err) {
      if (mountedRef.current) {
        // Revert optimistic update
        setIsSaved(previousSaved);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, [currentPlayerId, isSaved, court.id, onChanged]);

  return {
    isSaved,
    isSubmitting,
    error,
    toggle,
  };
}
