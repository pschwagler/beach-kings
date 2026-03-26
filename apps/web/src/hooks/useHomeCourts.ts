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
  get?: (entityId: string | number) => Promise<Court[]>;
  set: (entityId: string | number, courtIds: (string | number)[]) => Promise<any>;
}

interface UseHomeCourtsOptions {
  entityId: string | number | null;
  initialCourts?: Court[];
  api: HomeCourtsApi;
}

export default function useHomeCourts({ entityId, initialCourts, api }: UseHomeCourtsOptions) {
  const { showToast } = useToast();
  const [homeCourts, setHomeCourts] = useState<Court[]>(initialCourts || []);

  // Keep api in a ref so callbacks don't depend on its object identity
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  // Sync from external source (e.g. league prop changes)
  useEffect(() => {
    if (initialCourts) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prop to local state
      setHomeCourts(initialCourts);
    }
  }, [initialCourts]);

  // Fetch on mount if no initialCourts and we have a getter
  useEffect(() => {
    if (!initialCourts && entityId && apiRef.current.get) {
      apiRef.current.get(entityId)
        .then((courts) => setHomeCourts(courts || []))
        .catch(() => {});
    }
  }, [entityId, initialCourts]);

  /** Refetch from API (used for error rollback). */
  const refetch = useCallback(async () => {
    if (apiRef.current.get && entityId) {
      const courts = await apiRef.current.get(entityId);
      setHomeCourts(courts || []);
    }
  }, [entityId]);

  /**
   * Replace the entire home courts list with a new ordered array.
   * Optimistically updates UI, then calls the set API.
   */
  const handleSet = useCallback(async (newCourts: Court[]) => {
    const prev = homeCourts;
    const courtsWithPosition = newCourts.map((c, i) => ({ ...c, position: i }));
    setHomeCourts(courtsWithPosition);
    try {
      await apiRef.current.set(entityId, newCourts.map((c) => c.id));
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update home courts', 'error');
      if (apiRef.current.get) {
        await refetch();
      } else if (initialCourts) {
        setHomeCourts(initialCourts);
      } else {
        setHomeCourts(prev);
      }
    }
  }, [homeCourts, entityId, initialCourts, showToast, refetch]);

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
