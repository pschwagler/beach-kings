import { useCallback } from 'react';
import { useRouter } from 'expo-router';

/**
 * Returns a back handler that calls `router.back()` when there is stack
 * history, and falls back to `router.replace(fallback)` when the screen was
 * reached directly (e.g. deep link, cold start).
 *
 * When `fallback` is omitted, always calls `router.back()`.
 *
 * @example
 * const handleBack = useBack(routes.leagues());
 */
export function useBack(fallback?: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (fallback != null && !router.canGoBack()) {
      router.replace(fallback as never);
    } else {
      router.back();
    }
  }, [router, fallback]);
}
