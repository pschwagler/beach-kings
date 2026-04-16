/**
 * Generic data-fetching hook.
 *
 * Calls `fetcher` whenever `deps` change (if `enabled` is true).
 * Provides optimistic mutation via `mutate` and a manual `refetch`.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiOptions<T> {
  /** Pre-populate data before the first fetch completes. */
  readonly initialData?: T;
  /** Set to false to skip the fetch entirely. Default: true. */
  readonly enabled?: boolean;
}

interface UseApiResult<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  /** Manually trigger the fetcher regardless of deps. */
  refetch: () => Promise<void>;
  /** Optimistically set data without triggering a network request. */
  mutate: (data: T) => void;
}

/**
 * Generic data-fetching hook with loading/error state, manual refetch,
 * and optimistic mutation support.
 *
 * @param fetcher - Async function that resolves with the data.
 * @param deps - Dependency array; the hook re-fetches when these change.
 * @param options - Optional configuration (initialData, enabled).
 */
function useApi<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  options?: UseApiOptions<T>,
): UseApiResult<T> {
  const enabled = options?.enabled ?? true;

  const [data, setData] = useState<T | undefined>(options?.initialData);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);

  // Track whether the component is still mounted to avoid state updates after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, ...deps]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    void execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, execute]);

  const refetch = useCallback(async () => {
    await execute();
  }, [execute]);

  const mutate = useCallback((newData: T) => {
    setData(newData);
  }, []);

  return { data, error, isLoading, refetch, mutate };
}

export default useApi;
