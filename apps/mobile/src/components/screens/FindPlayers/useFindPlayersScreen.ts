/**
 * Data and interaction hook for the Find Players screen.
 *
 * Manages:
 *   - Player discovery via api.discoverPlayers()
 *   - Search query state (client-side filter)
 *   - Active tab state (players | friends)
 *   - Optimistic "pending" state for sent friend requests
 *
 * Friend-management concerns (friends list, incoming requests, accept/decline)
 * are delegated to the shared {@link useFriends} hook so the Social hub's
 * Friends tab and this screen don't duplicate that logic. Suggestions are
 * disabled here — the Find Players Friends sub-tab predates them.
 */

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticMedium } from '@/utils/haptics';
import type { Friend, FriendRequest } from '@beach-kings/shared';
import type { DiscoverPlayer } from './PlayerRow';
import { useFriends } from './useFriends';

export type FindPlayersTab = 'players' | 'friends';

/**
 * Raw shape of a single item from GET /api/friends/discover. The backend serializes
 * `id`/`location_name`/`total_games`/`mutual_friend_count`, which differ from the
 * flat {@link DiscoverPlayer} the row component reads — so it must be adapted.
 * Both field spellings are accepted so the mapper is resilient to either source.
 */
interface RawDiscoverItem {
  readonly id?: number;
  readonly player_id?: number;
  readonly full_name?: string | null;
  readonly avatar?: string | null;
  readonly city?: string | null;
  readonly location_name?: string | null;
  readonly level?: string | null;
  readonly games_played?: number;
  readonly total_games?: number;
  readonly mutual_friends_count?: number;
  readonly mutual_friend_count?: number;
  readonly last_active_label?: string | null;
  readonly friend_status?: DiscoverPlayer['friend_status'];
}

/**
 * Maps a raw discover item onto the flat DiscoverPlayer shape the UI consumes.
 * Critically, resolves `player_id` (backend sends `id`) so list keys, profile
 * navigation, and add-friend all target a real player.
 */
function mapDiscoverItem(it: RawDiscoverItem): DiscoverPlayer {
  return {
    player_id: it.player_id ?? it.id ?? 0,
    full_name: it.full_name ?? '',
    avatar: it.avatar ?? null,
    city: it.city ?? it.location_name ?? null,
    level: it.level ?? null,
    games_played: it.games_played ?? it.total_games ?? 0,
    mutual_friends_count: it.mutual_friends_count ?? it.mutual_friend_count ?? 0,
    last_active_label: it.last_active_label ?? null,
    friend_status: it.friend_status ?? 'none',
  };
}

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
  /** Fatal: the friends *list* fetch failed → show the full-page error state. */
  readonly friendsError: Error | null;
  /** Non-fatal: the friend-requests fetch failed → show an inline notice only. */
  readonly friendRequestsError: Error | null;
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
  const [pendingSendIds, setPendingSendIds] = useState<ReadonlySet<number>>(new Set());

  // ------- Players discovery -------
  const {
    data: rawPlayers,
    isLoading: isLoadingPlayers,
    error: playersError,
    refetch: refetchPlayers,
  } = useApi<DiscoverPlayer[]>(
    () =>
      api
        .discoverPlayers()
        .then((r: { items?: RawDiscoverItem[] } | RawDiscoverItem[]) => {
          const items = Array.isArray(r) ? r : (r?.items ?? []);
          return items.map(mapDiscoverItem);
        }),
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

  // ------- Friends + friend requests (delegated to the shared hook) -------
  const {
    friends,
    friendRequests,
    isLoadingFriends,
    friendsError,
    friendRequestsError,
    isRefreshingFriends,
    onRefreshFriends,
    onRetryFriends,
    onAcceptRequest,
    onDeclineRequest,
  } = useFriends({ searchQuery, withSuggestions: false });

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
    friendsError,
    friendRequestsError,
    isRefreshingFriends,
    onRefreshFriends,
    onRetryFriends,
    onAcceptRequest,
    onDeclineRequest,
    // Shared
    onPlayerPress,
  };
}
