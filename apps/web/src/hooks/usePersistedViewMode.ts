'use client';

import { useState, useCallback } from 'react';

const VALID_MODES = ['cards', 'clipboard'];

/**
 * Persists view mode (cards | clipboard) in localStorage.
 * @param storageKey - localStorage key
 * @param defaultMode - default when no stored value or invalid
 * @returns [viewMode, setViewMode]
 */
export function usePersistedViewMode(
  storageKey: string,
  defaultMode: string = 'cards',
): [string, (mode: string) => void] {
  const [viewMode, setViewModeState] = useState<string>(() => {
    if (typeof window === 'undefined') return defaultMode;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && VALID_MODES.includes(stored)) return stored;
    } catch (_) {}
    return defaultMode;
  });

  const setViewMode = useCallback(
    (mode: string) => {
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
