import { useCallback, useRef } from 'react';
import { useRouter, useSegments, useLocalSearchParams } from 'expo-router';
import { resolveUp, routes } from '@/lib/navigation';

/**
 * Returns a back handler.
 *
 * Back is temporal: when there is stack history it pops (`router.back()`). Only
 * when the screen is the entry point (deep link, notification tap, cold start)
 * — i.e. there is nothing to pop — does it navigate to a hierarchical "Up"
 * target instead, resolved from the centralized {@link routeUp} map (falling
 * back to Home if the route declares no parent).
 *
 * @param fallbackOverride Optional explicit Up target that overrides the map.
 *   Use only for inline sub-views where the route-derived parent is wrong.
 *
 * @example
 * // Standard usage — the parent is derived from the current route:
 * const handleBack = useBack();
 */
export function useBack(fallbackOverride?: string): () => void {
  const router = useRouter();
  const segments = useSegments() as string[];
  const params = useLocalSearchParams();

  // `useSegments`/`useLocalSearchParams` subscribe to the global route store
  // and `useLocalSearchParams` returns a new object identity every render, so
  // depending on them directly would recreate the handler (and re-render
  // every consumer) on any app-wide navigation. Stash the latest values in
  // refs updated on every render instead, and keep the callback's own deps
  // stable — the returned function always reads the current values via the
  // refs, so behavior is unchanged.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const target =
      fallbackOverride ??
      resolveUp(segmentsRef.current, paramsRef.current) ??
      routes.home();
    router.replace(target as never);
  }, [router, fallbackOverride]);
}
