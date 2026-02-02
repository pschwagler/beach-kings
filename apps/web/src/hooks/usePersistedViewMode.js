'use client';

import { useState, useCallback } from 'react';

const VALID_MODES = ['cards', 'clipboard'];

/**
 * Persists view mode (cards | clipboard) in localStorage.
 * @param {string} storageKey - localStorage key
 * @param {string} defaultMode - default when no stored value or invalid
 * @returns {[string, function]} [viewMode, setViewMode]
 */
export function usePersistedViewMode(storageKey, defaultMode = 'cards') {
  const [viewMode, setViewModeState] = useState(() => {
    if (typeof window === 'undefined') return defaultMode;
    try {
      const stored = localStorage.getItem(storageKey);
      if (VALID_MODES.includes(stored)) return stored;
    } catch (_) {}
    return defaultMode;
  });

  const setViewMode = useCallback(
    (mode) => {
      if (!VALID_MODES.includes(mode)) return;
      setViewModeState(mode);
      try {
        localStorage.setItem(storageKey, mode);
      } catch (_) {}
    },
    [storageKey]
  );

  return [viewMode, setViewMode];
}
