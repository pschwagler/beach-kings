/**
 * useFriends — friend-management data and interactions.
 *
 * Owns everything about a player's social graph so the Social hub's Friends tab
 * (and any other consumer) has a single source of truth instead of duplicating
 * fetch + optimistic-mutation logic:
 *   - Friends list via api.getFriends()
 *   - Incoming friend requests via api.getFriendRequests('incoming')
 *   - Suggested friends via api.getFriendSuggestions() (opt-out via options)
 *   - Optimistic accept / decline of incoming requests
 *   - Optimistic "add" (send request) for a suggested friend
 *   - Client-side name filter over the friends list
 *
 * Fetches are deliberately decoupled: a failed friends-list fetch is fatal
 * (`friendsError`), while a failed requests or suggestions fetch degrades to a
 * non-fatal inline notice so the rest of the screen still renders. Loading is
 * decoupled the same way — `isLoadingFriends` gates only on the friends +
 * requests fetches, so a slow suggestions call never blocks the primary
 * content; consumers can use `isLoadingSuggestions` to let that section fill
 * in when it lands.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hapticMedium } from '@/utils/haptics';
import type { Friend, FriendRequest } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { socialApi } from '@/lib/socialApi';
import { socialQueryKeys } from '@/lib/socialQueryKeys';
import {
  useFriendshipMutations,
  usePendingFriendRequestPlayerIds,
} from '@/hooks/useFriendshipMutations';

export interface UseFriendsOptions {
  /** Client-side filter applied to the friends list (matches name or city). */
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
  /**
   * True while the friends or requests fetch is loading. Deliberately
   * excludes suggestions so a slow suggestions call never blocks the
   * primary content behind the skeleton.
   */
  readonly isLoadingFriends: boolean;
  /** True while the (enabled) suggestions fetch is loading. */
  readonly isLoadingSuggestions: boolean;
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
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  const friendshipMutations = useFriendshipMutations();

  const [isRefreshingFriends, setIsRefreshingFriends] = useState(false);
  const pendingAddIds = usePendingFriendRequestPlayerIds();

  // ------- Friends list -------
  const friendsQuery = useQuery({
    queryKey: socialQueryKeys.friends(userId),
    queryFn: socialApi.getFriends,
    enabled: isAuthenticated && userId !== 0,
  });

  // ------- Incoming requests -------
  const requestsQuery = useQuery({
    queryKey: socialQueryKeys.requests(userId, 'incoming'),
    queryFn: () => socialApi.getFriendRequests('incoming'),
    enabled: isAuthenticated && userId !== 0,
  });

  // ------- Suggestions (opt-out) -------
  const suggestionsQuery = useQuery({
    queryKey: socialQueryKeys.suggestions(userId),
    queryFn: socialApi.getFriendSuggestions,
    enabled: isAuthenticated && userId !== 0 && withSuggestions,
  });

  const friendsData = friendsQuery.data;
  const requestsData = requestsQuery.data;
  const suggestionsData = suggestionsQuery.data;

  const friends = useMemo<readonly Friend[]>(() => {
    const all = friendsData ?? [];
    if (searchQuery.trim() === '') return all;
    const lower = searchQuery.toLowerCase();
    return all.filter(
      (f) =>
        f.full_name.toLowerCase().includes(lower) ||
        (f.location_name != null &&
          f.location_name.toLowerCase().includes(lower)),
    );
  }, [friendsData, searchQuery]);

  const friendRequests = useMemo<readonly FriendRequest[]>(
    () => requestsData ?? [],
    [requestsData],
  );

  const suggestions = useMemo<readonly Friend[]>(
    () => suggestionsData ?? [],
    [suggestionsData],
  );

  const isLoadingFriends = friendsQuery.isPending || requestsQuery.isPending;
  const isLoadingSuggestions = withSuggestions && suggestionsQuery.isPending;

  const onRefreshFriends = useCallback(() => {
    setIsRefreshingFriends(true);
    Promise.all([
      friendsQuery.refetch(),
      requestsQuery.refetch(),
      ...(withSuggestions ? [suggestionsQuery.refetch()] : []),
    ]).finally(() => {
      setIsRefreshingFriends(false);
    });
  }, [friendsQuery, requestsQuery, suggestionsQuery, withSuggestions]);

  const onRetryFriends = useCallback(() => {
    void friendsQuery.refetch();
    void requestsQuery.refetch();
    if (withSuggestions) void suggestionsQuery.refetch();
  }, [friendsQuery, requestsQuery, suggestionsQuery, withSuggestions]);

  const onAcceptRequest = useCallback(
    (requestId: number) => {
      void hapticMedium();
      friendshipMutations.accept.mutate({ requestId });
    },
    [friendshipMutations.accept],
  );

  const onDeclineRequest = useCallback(
    (requestId: number) => {
      void hapticMedium();
      friendshipMutations.decline.mutate({ requestId });
    },
    [friendshipMutations.decline],
  );

  const onAddSuggestion = useCallback((playerId: number) => {
    void hapticMedium();
    friendshipMutations.send.mutate(playerId);
  }, [friendshipMutations.send]);

  return {
    friends,
    friendRequests,
    suggestions,
    isLoadingFriends,
    isLoadingSuggestions,
    friendsError: friendsQuery.error,
    friendRequestsError: requestsQuery.error,
    suggestionsError: suggestionsQuery.error,
    isRefreshingFriends,
    onRefreshFriends,
    onRetryFriends,
    onAcceptRequest,
    onDeclineRequest,
    pendingAddIds,
    onAddSuggestion,
  };
}
