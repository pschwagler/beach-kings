/**
 * Calls `refetch` whenever the screen gains navigation focus, with an
 * optional cooldown to prevent redundant network requests.
 *
 * Uses `useFocusEffect` from expo-router so it integrates cleanly with
 * the Expo Router navigation stack.
 */
import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/** Default cooldown between focus-triggered refreshes (30 seconds). */
const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * Calls `refetch` each time the enclosing screen comes into focus,
 * subject to a cooldown period.
 *
 * @param refetch - Function to call on focus (may be async).
 * @param cooldownMs - Minimum milliseconds between fetches. Default: 30 000.
 */
function useRefreshOnFocus(
  refetch: () => void | Promise<void>,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): void {
  const lastFetchedAt = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFetchedAt.current < cooldownMs) return;

      lastFetchedAt.current = now;
      void refetch();
    }, [refetch, cooldownMs]),
  );
}

export default useRefreshOnFocus;
