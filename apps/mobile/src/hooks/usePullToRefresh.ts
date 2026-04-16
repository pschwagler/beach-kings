/**
 * Wraps an async `refetch` function with the `refreshing` boolean and
 * `onRefresh` callback required by React Native's `RefreshControl`.
 */
import { useState, useCallback } from 'react';

interface UsePullToRefreshResult {
  /** Whether a pull-to-refresh is currently in progress. */
  refreshing: boolean;
  /** Pass directly to `<RefreshControl onRefresh={onRefresh} />`. */
  onRefresh: () => void;
}

/**
 * Manages pull-to-refresh state for use with `ScrollView` or `FlatList`
 * `refreshControl` props.
 *
 * @param refetch - Async function that reloads the data.
 *
 * @example
 * ```tsx
 * const { refreshing, onRefresh } = usePullToRefresh(refetch);
 * <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
 * ```
 */
function usePullToRefresh(refetch: () => Promise<void>): UsePullToRefreshResult {
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch().finally(() => {
      setRefreshing(false);
    });
  }, [refetch]);

  return { refreshing, onRefresh };
}

export default usePullToRefresh;
