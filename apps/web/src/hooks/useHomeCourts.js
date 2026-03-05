import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';

/**
 * Manage home courts for a league or player with optimistic updates.
 *
 * @param {Object} options
 * @param {number|string|null} options.entityId - League or player ID
 * @param {Array<{id, name, address}>} [options.initialCourts] - Initial courts (e.g. from league prop)
 * @param {Object} options.api - API functions: { get, add, remove, reorder }
 *   - get(entityId) → court[] — fetch current list (optional if initialCourts provided)
 *   - add(entityId, courtId) → void
 *   - remove(entityId, courtId) → void
 *   - reorder(entityId, courtPositions) → void — optional, enables set-as-primary
 * @returns {{ homeCourts, showBrowser, setShowBrowser, handleConfirm, handleRemove, handleSetPrimary }}
 */
export default function useHomeCourts({ entityId, initialCourts, api }) {
  const { showToast } = useToast();
  const [homeCourts, setHomeCourts] = useState(initialCourts || []);
  const [showBrowser, setShowBrowser] = useState(false);

  // Keep api in a ref so callbacks don't depend on its object identity
  const apiRef = useRef(api);
  apiRef.current = api;

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
   * Handle court browser confirm: diff selected vs current,
   * POST adds and DELETE removes with optimistic update.
   */
  const handleConfirm = useCallback(async (selectedCourts) => {
    const currentIds = new Set(homeCourts.map((c) => c.id));
    const selectedIds = new Set(selectedCourts.map((c) => c.id));

    const toAdd = selectedCourts.filter((c) => !currentIds.has(c.id));
    const toRemove = homeCourts.filter((c) => !selectedIds.has(c.id));

    // Optimistic update
    setHomeCourts(selectedCourts.map((c, i) => ({ ...c, position: i })));

    try {
      await Promise.all([
        ...toAdd.map((c) => apiRef.current.add(entityId, c.id)),
        ...toRemove.map((c) => apiRef.current.remove(entityId, c.id)),
      ]);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update home courts', 'error');
      if (apiRef.current.get) {
        await refetch();
      } else if (initialCourts) {
        setHomeCourts(initialCourts);
      }
    }
  }, [homeCourts, entityId, initialCourts, showToast, refetch]);

  /** Remove a single home court with optimistic update. */
  const handleRemove = useCallback(async (courtId) => {
    setHomeCourts((prev) => prev.filter((c) => c.id !== courtId));
    try {
      await apiRef.current.remove(entityId, courtId);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to remove home court', 'error');
      if (apiRef.current.get) {
        await refetch();
      } else if (initialCourts) {
        setHomeCourts(initialCourts);
      }
    }
  }, [entityId, initialCourts, showToast, refetch]);

  /**
   * Set a court as primary by moving it to position 0.
   * Requires api.reorder to be provided.
   */
  const handleSetPrimary = useCallback(async (courtId) => {
    if (!apiRef.current.reorder || !entityId) return;

    const court = homeCourts.find((c) => c.id === courtId);
    if (!court || homeCourts[0]?.id === courtId) return; // already primary or not found

    // Optimistic: move to front
    const reordered = [court, ...homeCourts.filter((c) => c.id !== courtId)];
    setHomeCourts(reordered);

    try {
      await apiRef.current.reorder(entityId, reordered.map((c, i) => ({ court_id: c.id, position: i })));
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to set primary court', 'error');
      if (apiRef.current.get) {
        await refetch();
      } else if (initialCourts) {
        setHomeCourts(initialCourts);
      }
    }
  }, [homeCourts, entityId, initialCourts, showToast, refetch]);

  return { homeCourts, showBrowser, setShowBrowser, handleConfirm, handleRemove, handleSetPrimary };
}
