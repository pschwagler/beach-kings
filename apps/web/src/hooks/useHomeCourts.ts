import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';
import type { Court } from '../types';

/**
 * Manage home courts for a league or player with optimistic updates.
 *
 * Uses a single `set` API call to replace the entire list, avoiding
 * stale-closure bugs from rapid sequential add/remove calls.
 *
 * @param {Object} options
 * @param {number|string|null} options.entityId - League or player ID
 * @param {Array<{id, name, address}>} [options.initialCourts] - Initial courts (e.g. from league prop)
 * @param {Object} options.api - API functions: { get, set }
 *   - get(entityId) → court[] — fetch current list (optional if initialCourts provided)
 *   - set(entityId, courtIds) → court[] — replace all courts with ordered list
 * @returns {{ homeCourts, handleSet, handleRemove, handleSetPrimary }}
 */
interface HomeCourtsApi {
  get?: (entityId: number) => Promise<Court[]>;
  set: (entityId: number, courtIds: number[]) => Promise<unknown>;
}

interface UseHomeCourtsOptions {
  entityId: number | null;
  initialCourts?: Court[];
  api: HomeCourtsApi;
}

export default function useHomeCourts({ entityId, initialCourts, api }: UseHomeCourtsOptions) {
  const { showToast } = useToast();

  // Tracks optimistic/local mutations. null means "no local override — defer to initialCourts".
  const [localCourts, setLocalCourts] = useState<Court[] | null>(null);

  // Derive the effective list: local optimistic state takes precedence, then the prop, then empty.
  const homeCourts: Court[] = localCourts ?? initialCourts ?? [];

  // Keep api in a ref so callbacks don't depend on its object identity
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  // Fetch on mount if no initialCourts and we have a getter
  useEffect(() => {
    if (!initialCourts && entityId && apiRef.current.get) {
      apiRef.current.get(entityId)
        .then((courts) => setLocalCourts(courts || []))
        .catch(() => {});
    }
  }, [entityId, initialCourts]);

  /** Refetch from API (used for error rollback). */
  const refetch = useCallback(async () => {
    if (apiRef.current.get && entityId) {
      const courts = await apiRef.current.get(entityId);
      setLocalCourts(courts || []);
    }
  }, [entityId]);

  /**
   * Replace the entire home courts list with a new ordered array.
   * Optimistically updates UI, then calls the set API.
   */
  const handleSet = useCallback(async (newCourts: Court[]) => {
    if (entityId == null) return;
    const prev = localCourts;
    const courtsWithPosition = newCourts.map((c, i) => ({ ...c, position: i }));
    setLocalCourts(courtsWithPosition);
    try {
      await apiRef.current.set(entityId, newCourts.map((c) => c.id as number));
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update home courts', 'error');
      if (apiRef.current.get) {
        await refetch();
      } else if (initialCourts) {
        // Reset local override so the derived value falls back to initialCourts
        setLocalCourts(null);
      } else {
        setLocalCourts(prev);
      }
    }
  }, [localCourts, entityId, initialCourts, showToast, refetch]);

  /** Remove a single home court. */
  const handleRemove = useCallback(async (courtId: string | number) => {
    await handleSet(homeCourts.filter((c) => c.id !== courtId));
  }, [homeCourts, handleSet]);

  /** Set a court as primary by moving it to position 0. */
  const handleSetPrimary = useCallback(async (courtId: string | number) => {
    const court = homeCourts.find((c) => c.id === courtId);
    if (!court || homeCourts[0]?.id === courtId) return;
    await handleSet([court, ...homeCourts.filter((c) => c.id !== courtId)]);
  }, [homeCourts, handleSet]);

  return { homeCourts, handleSet, handleRemove, handleSetPrimary };
}
