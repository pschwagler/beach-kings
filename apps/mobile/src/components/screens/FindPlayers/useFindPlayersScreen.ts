/**
 * Data and interaction hook for the Find Players screen.
 *
 * Manages:
 *   - Player discovery via api.discoverPlayers()
 *   - Friends list via api.getFriends()
 *   - Incoming friend requests via api.getFriendRequests()
 *   - Search query state (client-side filter)
 *   - Active tab state (players | friends)
 *   - Optimistic "pending" state for sent friend requests
 *   - Accept / decline friend request callbacks
 */

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticMedium } from '@/utils/haptics';
import type { Friend, FriendRequest } from '@beach-kings/shared';
import type { DiscoverPlayer } from './PlayerRow';

export type FindPlayersTab = 'players' | 'friends';

export interface UseFindPlayersScreenResult {
  readonly activeTab: FindPlayersTab;
  readonly setActiveTab: (tab: FindPlayersTab) => void;
  readonly searchQuery: string;
  readonly setSearchQuery: (q: string) => void;
  // Players tab
  readonly players: readonly DiscoverPlayer[];
  readonly isLoadingPlayers: boolean;
  readonly playersError: Error | null;
  readonly isRefreshingPlayers: boolean;
  readonly onRefreshPlayers: () => void;
  readonly onRetryPlayers: () => void;
  readonly onAddFriend: (playerId: number) => void;
  readonly pendingSendIds: ReadonlySet<number>;
  // Friends tab
  readonly friends: readonly Friend[];
  readonly friendRequests: readonly FriendRequest[];
  readonly isLoadingFriends: boolean;
  readonly friendsError: Error | null;
  readonly isRefreshingFriends: boolean;
  readonly onRefreshFriends: () => void;
  readonly onRetryFriends: () => void;
  readonly onAcceptRequest: (requestId: number) => void;
  readonly onDeclineRequest: (requestId: number) => void;
  // Shared
  readonly onPlayerPress: (playerId: number) => void;
}

/**
 * Returns all data and handlers for the Find Players screen.
 */
export function useFindPlayersScreen(): UseFindPlayersScreenResult {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FindPlayersTab>('players');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshingPlayers, setIsRefreshingPlayers] = useState(false);
  const [isRefreshingFriends, setIsRefreshingFriends] = useState(false);
  const [pendingSendIds, setPendingSendIds] = useState<ReadonlySet<number>>(new Set());

  // ------- Players discovery -------
  const {
    data: rawPlayers,
    isLoading: isLoadingPlayers,
    error: playersError,
    refetch: refetchPlayers,
  } = useApi<DiscoverPlayer[]>(
    () => api.discoverPlayers() as Promise<DiscoverPlayer[]>,
    [],
  );

  const players = useMemo<readonly DiscoverPlayer[]>(() => {
    const all = rawPlayers ?? [];
    if (searchQuery.trim() === '') return all;
    const lower = searchQuery.toLowerCase();
    return all.filter(
      (p) =>
        p.full_name.toLowerCase().includes(lower) ||
        (p.city != null && p.city.toLowerCase().includes(lower)),
    );
  }, [rawPlayers, searchQuery]);

  const onRefreshPlayers = useCallback(() => {
    setIsRefreshingPlayers(true);
    refetchPlayers().finally(() => {
      setIsRefreshingPlayers(false);
    });
  }, [refetchPlayers]);

  const onRetryPlayers = useCallback(() => {
    void refetchPlayers();
  }, [refetchPlayers]);

  const onAddFriend = useCallback(
    (playerId: number) => {
      void hapticMedium();
      // Optimistic: mark as pending immediately
      setPendingSendIds((prev) => new Set([...prev, playerId]));
      api.sendFriendRequest(playerId).catch(() => {
        // Roll back on failure
        setPendingSendIds((prev) => {
          const next = new Set([...prev]);
          next.delete(playerId);
          return next;
        });
      });
    },
    [],
  );

  // ------- Friends + friend requests -------
  const {
    data: friendsData,
    isLoading: isLoadingFriendsRaw,
    error: friendsError,
    refetch: refetchFriends,
    mutate: mutateFriends,
  } = useApi<Friend[]>(
    () =>
      api
        .getFriends()
        .then((r: { items?: Friend[] } | Friend[]) =>
          Array.isArray(r) ? r : (r.items ?? []),
        ),
    [],
  );

  const {
    data: requestsData,
    isLoading: isLoadingRequests,
    error: requestsError,
    refetch: refetchRequests,
    mutate: mutateRequests,
  } = useApi<FriendRequest[]>(
    () =>
      api
        .getFriendRequests('received')
        .then((r: { items?: FriendRequest[] } | FriendRequest[]) =>
          Array.isArray(r) ? r : (r.items ?? []),
        ),
    [],
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

  const isLoadingFriends = isLoadingFriendsRaw || isLoadingRequests;
  const friendsErrorCombined = friendsError ?? requestsError;

  const onRefreshFriends = useCallback(() => {
    setIsRefreshingFriends(true);
    Promise.all([refetchFriends(), refetchRequests()]).finally(() => {
      setIsRefreshingFriends(false);
    });
  }, [refetchFriends, refetchRequests]);

  const onRetryFriends = useCallback(() => {
    void refetchFriends();
    void refetchRequests();
  }, [refetchFriends, refetchRequests]);

  const onAcceptRequest = useCallback(
    (requestId: number) => {
      void hapticMedium();
      // Optimistic: remove from requests list
      const prevRequests = requestsData ?? [];
      mutateRequests(prevRequests.filter((r) => r.id !== requestId));
      api.acceptFriendRequest(requestId).catch(() => {
        // Roll back
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

  const onPlayerPress = useCallback(
    (playerId: number) => {
      router.push(routes.player(playerId));
    },
    [router],
  );

  return {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    // Players tab
    players,
    isLoadingPlayers,
    playersError,
    isRefreshingPlayers,
    onRefreshPlayers,
    onRetryPlayers,
    onAddFriend,
    pendingSendIds,
    // Friends tab
    friends,
    friendRequests,
    isLoadingFriends,
    friendsError: friendsErrorCombined,
    isRefreshingFriends,
    onRefreshFriends,
    onRetryFriends,
    onAcceptRequest,
    onDeclineRequest,
    // Shared
    onPlayerPress,
  };
}
