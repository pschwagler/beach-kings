/**
 * useDiscoverPlayers — player-discovery data and interactions.
 *
 * Owns everything about discovering new players so both the Social hub's Find
 * Players tab and the standalone Find Players screen share a single source of
 * truth instead of duplicating fetch + optimistic-mutation logic:
 *   - Discoverable players via api.discoverPlayers()
 *   - Server-side filter chips: skill level (single-select toggle),
 *     same-league-only, and shared-friends-only — each change refetches
 *   - Server-side name search: the raw search box text is debounced and sent
 *     as the discover `search` param so it applies to the full roster, not
 *     just the first page of results
 *   - Optimistic "pending" state for sent friend requests (add-friend)
 *
 * Split out so the discover-only Social hub Find Players tab (`FindPlayersTab`)
 * can mount just this hook without also fetching friends / requests /
 * suggestions. Pairs with {@link useFriends} as the two halves of the former
 * combined Find Players screen.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hapticMedium } from '@/utils/haptics';
import { useAuth } from '@/contexts/AuthContext';
import type { DiscoverFilters, DiscoverPlayer } from '@beach-kings/shared';
import {
  useFriendshipMutations,
  usePendingFriendRequestPlayerIds,
  socialQueries,
} from '@/features/social';

export interface UseDiscoverPlayersOptions {
  /**
   * Raw search-box text. Debounced and sent to the server as the discover
   * `search` param (name match), so it covers the full roster rather than
   * only the first page of results.
   */
  readonly searchQuery?: string;
}

/** Skill levels offered as discover filter chips (mirrors SkillLevel values). */
export type DiscoverLevel = 'Open' | 'AA' | 'advanced' | 'intermediate' | 'beginner';

export interface UseDiscoverPlayersResult {
  /** Discoverable players (server-filtered by `searchQuery` when provided). */
  readonly players: readonly DiscoverPlayer[];
  readonly isLoadingPlayers: boolean;
  readonly playersError: Error | null;
  readonly isRefreshingPlayers: boolean;
  readonly onRefreshPlayers: () => void;
  readonly onRetryPlayers: () => void;
  readonly onAddFriend: (playerId: number) => void;
  /** Player IDs with an in-flight/optimistically-sent friend request. */
  readonly pendingSendIds: ReadonlySet<number>;
  /** Active level chip, or null when no level filter is applied. */
  readonly levelFilter: DiscoverLevel | null;
  readonly sameLeagueOnly: boolean;
  readonly sharedFriendsOnly: boolean;
  /** Single-select toggle: tapping the active level clears it. */
  readonly onToggleLevel: (level: DiscoverLevel) => void;
  readonly onToggleSameLeague: () => void;
  readonly onToggleSharedFriends: () => void;
}

/**
 * Returns player-discovery data and handlers.
 */
export function useDiscoverPlayers(
  options: UseDiscoverPlayersOptions = {},
): UseDiscoverPlayersResult {
  const { searchQuery = '' } = options;
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  const friendshipMutations = useFriendshipMutations();

  const [isRefreshingPlayers, setIsRefreshingPlayers] = useState(false);
  const pendingSendIds = usePendingFriendRequestPlayerIds();
  const [levelFilter, setLevelFilter] = useState<DiscoverLevel | null>(null);
  const [sameLeagueOnly, setSameLeagueOnly] = useState(false);
  const [sharedFriendsOnly, setSharedFriendsOnly] = useState(false);

  // Debounce the raw search text so each keystroke doesn't fire a request.
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchQuery.trim());
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const filters = useMemo<DiscoverFilters>(() => ({
    ...(levelFilter != null ? { level: levelFilter } : {}),
    ...(sameLeagueOnly ? { same_league: true as const } : {}),
    ...(sharedFriendsOnly ? { has_mutuals: true as const } : {}),
    ...(debouncedSearch !== '' ? { search: debouncedSearch } : {}),
  }), [levelFilter, sameLeagueOnly, sharedFriendsOnly, debouncedSearch]);
  const playersQuery = useQuery(
    socialQueries.discovery(userId, filters, isAuthenticated),
  );
  const rawPlayers = playersQuery.data;

  // The server applies the search filter, so results are used as-is.
  const players = useMemo<readonly DiscoverPlayer[]>(
    () => rawPlayers ?? [],
    [rawPlayers],
  );

  const onRefreshPlayers = useCallback(() => {
    setIsRefreshingPlayers(true);
    playersQuery.refetch().finally(() => {
      setIsRefreshingPlayers(false);
    });
  }, [playersQuery]);

  const onRetryPlayers = useCallback(() => {
    void playersQuery.refetch();
  }, [playersQuery]);

  const onToggleLevel = useCallback((level: DiscoverLevel) => {
    setLevelFilter((prev) => (prev === level ? null : level));
  }, []);

  const onToggleSameLeague = useCallback(() => {
    setSameLeagueOnly((prev) => !prev);
  }, []);

  const onToggleSharedFriends = useCallback(() => {
    setSharedFriendsOnly((prev) => !prev);
  }, []);

  const onAddFriend = useCallback((playerId: number) => {
    void hapticMedium();
    friendshipMutations.send.mutate(playerId);
  }, [friendshipMutations.send]);

  return {
    players,
    isLoadingPlayers: playersQuery.isPending,
    playersError: playersQuery.error,
    isRefreshingPlayers,
    onRefreshPlayers,
    onRetryPlayers,
    onAddFriend,
    pendingSendIds,
    levelFilter,
    sameLeagueOnly,
    sharedFriendsOnly,
    onToggleLevel,
    onToggleSameLeague,
    onToggleSharedFriends,
  };
}
