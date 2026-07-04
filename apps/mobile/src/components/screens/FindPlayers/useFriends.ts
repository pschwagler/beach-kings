/**
 * useFriends — friend-management data and interactions.
 *
 * Owns everything about a player's social graph so both the Social hub's
 * Friends tab and the (discover-focused) Find Players screen can share a single
 * source of truth instead of duplicating fetch + optimistic-mutation logic:
 *   - Friends list via api.getFriends()
 *   - Incoming friend requests via api.getFriendRequests('incoming')
 *   - Suggested friends via api.getFriendSuggestions() (opt-out via options)
 *   - Optimistic accept / decline of incoming requests
 *   - Optimistic "add" (send request) for a suggested friend
 *   - Client-side name filter over the friends list
 *
 * Fetches are deliberately decoupled: a failed friends-list fetch is fatal
 * (`friendsError`), while a failed requests or suggestions fetch degrades to a
 * non-fatal inline notice so the rest of the screen still renders.
 */

import { useState, useCallback, useMemo } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import type { Friend, FriendRequest } from '@beach-kings/shared';

/** Accepts either a bare array or the paginated `{ items }` envelope. */
function toList<T>(r: { items?: T[] } | T[]): T[] {
  return Array.isArray(r) ? r : (r.items ?? []);
}

export interface UseFriendsOptions {
  /** Client-side filter applied to the friends list (matches full_name). */
  readonly searchQuery?: string;
  /**
   * Whether to fetch suggested friends. Defaults to true. The Find Players
   * screen opts out (its Friends sub-tab predates suggestions) so no extra
   * request is issued there.
   */
  readonly withSuggestions?: boolean;
}

export interface UseFriendsResult {
  /** Friends list, filtered by `searchQuery` when provided. */
  readonly friends: readonly Friend[];
  readonly friendRequests: readonly FriendRequest[];
  readonly suggestions: readonly Friend[];
  /** True while any of the underlying fetches is loading. */
  readonly isLoadingFriends: boolean;
  /** Fatal: the friends *list* fetch failed → show the full-page error state. */
  readonly friendsError: Error | null;
  /** Non-fatal: the friend-requests fetch failed → inline notice only. */
  readonly friendRequestsError: Error | null;
  /** Non-fatal: the suggestions fetch failed → hide the section silently. */
  readonly suggestionsError: Error | null;
  readonly isRefreshingFriends: boolean;
  readonly onRefreshFriends: () => void;
  readonly onRetryFriends: () => void;
  readonly onAcceptRequest: (requestId: number) => void;
  readonly onDeclineRequest: (requestId: number) => void;
  /** Player IDs with an in-flight/optimistically-sent friend request. */
  readonly pendingAddIds: ReadonlySet<number>;
  readonly onAddSuggestion: (playerId: number) => void;
}

/**
 * Returns friend-management data and handlers.
 */
export function useFriends(options: UseFriendsOptions = {}): UseFriendsResult {
  const { searchQuery = '', withSuggestions = true } = options;

  const [isRefreshingFriends, setIsRefreshingFriends] = useState(false);
  const [pendingAddIds, setPendingAddIds] = useState<ReadonlySet<number>>(
    new Set(),
  );

  // ------- Friends list -------
  const {
    data: friendsData,
    isLoading: isLoadingFriendsRaw,
    error: friendsError,
    refetch: refetchFriends,
  } = useApi<Friend[]>(() => api.getFriends().then(toList), []);

  // ------- Incoming requests -------
  const {
    data: requestsData,
    isLoading: isLoadingRequests,
    error: friendRequestsError,
    refetch: refetchRequests,
    mutate: mutateRequests,
  } = useApi<FriendRequest[]>(
    () => api.getFriendRequests('incoming').then(toList),
    [],
  );

  // ------- Suggestions (opt-out) -------
  const {
    data: suggestionsData,
    isLoading: isLoadingSuggestions,
    error: suggestionsError,
    refetch: refetchSuggestions,
  } = useApi<Friend[]>(
    () =>
      withSuggestions
        ? api.getFriendSuggestions().then(toList)
        : Promise.resolve<Friend[]>([]),
    [withSuggestions],
    { enabled: withSuggestions },
  );

  const friends = useMemo<readonly Friend[]>(() => {
    const all = friendsData ?? [];
    if (searchQuery.trim() === '') return all;
    const lower = searchQuery.toLowerCase();
    return all.filter((f) => f.full_name.toLowerCase().includes(lower));
  }, [friendsData, searchQuery]);

  const friendRequests = useMemo<readonly FriendRequest[]>(
    () => requestsData ?? [],
    [requestsData],
  );

  const suggestions = useMemo<readonly Friend[]>(
    () => suggestionsData ?? [],
    [suggestionsData],
  );

  const isLoadingFriends =
    isLoadingFriendsRaw ||
    isLoadingRequests ||
    (withSuggestions && isLoadingSuggestions);

  const onRefreshFriends = useCallback(() => {
    setIsRefreshingFriends(true);
    Promise.all([
      refetchFriends(),
      refetchRequests(),
      refetchSuggestions(),
    ]).finally(() => {
      setIsRefreshingFriends(false);
    });
  }, [refetchFriends, refetchRequests, refetchSuggestions]);

  const onRetryFriends = useCallback(() => {
    void refetchFriends();
    void refetchRequests();
    void refetchSuggestions();
  }, [refetchFriends, refetchRequests, refetchSuggestions]);

  const onAcceptRequest = useCallback(
    (requestId: number) => {
      void hapticMedium();
      const prevRequests = requestsData ?? [];
      mutateRequests(prevRequests.filter((r) => r.id !== requestId));
      api.acceptFriendRequest(requestId).catch(() => {
        mutateRequests(prevRequests);
      });
    },
    [requestsData, mutateRequests],
  );

  const onDeclineRequest = useCallback(
    (requestId: number) => {
      void hapticMedium();
      const prevRequests = requestsData ?? [];
      mutateRequests(prevRequests.filter((r) => r.id !== requestId));
      api.declineFriendRequest(requestId).catch(() => {
        mutateRequests(prevRequests);
      });
    },
    [requestsData, mutateRequests],
  );

  const onAddSuggestion = useCallback((playerId: number) => {
    void hapticMedium();
    // Optimistic: mark as pending immediately.
    setPendingAddIds((prev) => new Set([...prev, playerId]));
    api.sendFriendRequest(playerId).catch(() => {
      // Roll back on failure.
      setPendingAddIds((prev) => {
        const next = new Set([...prev]);
        next.delete(playerId);
        return next;
      });
    });
  }, []);

  return {
    friends,
    friendRequests,
    suggestions,
    isLoadingFriends,
    friendsError,
    friendRequestsError,
    suggestionsError,
    isRefreshingFriends,
    onRefreshFriends,
    onRetryFriends,
    onAcceptRequest,
    onDeclineRequest,
    pendingAddIds,
    onAddSuggestion,
  };
}
