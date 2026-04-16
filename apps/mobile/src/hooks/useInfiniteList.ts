/**
 * Paginated infinite-scroll list hook, designed for use with FlashList.
 *
 * Tracks a page cursor, appends results on `loadMore`, and signals
 * `hasMore` based on whether the last page was full.
 */
import { useState, useCallback, useRef } from 'react';

interface UseInfiniteListOptions {
  /** Number of items to request per page. Default: 20. */
  readonly pageSize?: number;
}

interface UseInfiniteListResult<T> {
  data: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  /** Fetch the next page and append its results. */
  loadMore: () => void;
  /** Reset to page 1 and re-fetch. */
  refetch: () => Promise<void>;
}

/**
 * Infinite-scroll hook that manages pagination state for FlashList.
 *
 * `hasMore` is derived by comparing the length of the last fetched page
 * against `pageSize` — if the page was short, there are no more items.
 *
 * @param fetcher - Async function accepting (page, pageSize) and returning an array.
 * @param options - Optional configuration (pageSize).
 */
function useInfiniteList<T>(
  fetcher: (page: number, pageSize: number) => Promise<T[]>,
  options?: UseInfiniteListOptions,
): UseInfiniteListResult<T> {
  const pageSize = options?.pageSize ?? 20;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  // Guard against concurrent loadMore calls.
  const isFetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (pageNumber: number, append: boolean) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const results = await fetcher(pageNumber, pageSize);
        const newHasMore = results.length >= pageSize;

        setData((prev) => (append ? [...prev, ...results] : results));
        setHasMore(newHasMore);
        setPage(pageNumber);
      } catch {
        // Silently preserve existing data on error; callers can surface via UI.
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [fetcher, pageSize],
  );

  // Kick off the initial load once on mount.
  const initialLoadDone = useRef(false);
  if (!initialLoadDone.current) {
    initialLoadDone.current = true;
    void fetchPage(1, false);
  }

  const loadMore = useCallback(() => {
    if (!hasMore || isFetchingRef.current) return;
    void fetchPage(page + 1, true);
  }, [fetchPage, hasMore, page]);

  const refetch = useCallback(async () => {
    setData([]);
    setHasMore(true);
    await fetchPage(1, false);
  }, [fetchPage]);

  return { data, isLoading, isLoadingMore, hasMore, loadMore, refetch };
}

export default useInfiniteList;
