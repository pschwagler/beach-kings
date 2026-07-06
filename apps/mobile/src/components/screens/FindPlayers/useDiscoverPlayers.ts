/**
 * useDiscoverPlayers — player-discovery data and interactions.
 *
 * Owns everything about discovering new players so both the Social hub's Find
 * Players tab and the standalone Find Players screen share a single source of
 * truth instead of duplicating fetch + optimistic-mutation logic:
 *   - Discoverable players via api.discoverPlayers()
 *   - Server-side filter chips: skill level (single-select toggle),
 *     same-league-only, and shared-friends-only — each change refetches
 *   - Client-side name/city filter over the discover list
 *   - Optimistic "pending" state for sent friend requests (add-friend)
 *
 * Split out so the discover-only Social hub Find Players tab (`FindPlayersTab`)
 * can mount just this hook without also fetching friends / requests /
 * suggestions. Pairs with {@link useFriends} as the two halves of the former
 * combined Find Players screen.
 */

import { useState, useCallback, useMemo } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import type { DiscoverPlayer } from './PlayerRow';

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

export interface UseDiscoverPlayersOptions {
  /** Client-side filter applied to the discover list (matches name or city). */
  readonly searchQuery?: string;
}

/** Skill levels offered as discover filter chips (mirrors SkillLevel values). */
export type DiscoverLevel = 'Open' | 'AA' | 'advanced' | 'intermediate' | 'beginner';

export interface UseDiscoverPlayersResult {
  /** Discoverable players, filtered by `searchQuery` when provided. */
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

  const [isRefreshingPlayers, setIsRefreshingPlayers] = useState(false);
  const [pendingSendIds, setPendingSendIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [levelFilter, setLevelFilter] = useState<DiscoverLevel | null>(null);
  const [sameLeagueOnly, setSameLeagueOnly] = useState(false);
  const [sharedFriendsOnly, setSharedFriendsOnly] = useState(false);

  const {
    data: rawPlayers,
    isLoading: isLoadingPlayers,
    error: playersError,
    refetch: refetchPlayers,
  } = useApi<DiscoverPlayer[]>(
    () =>
      api
        .discoverPlayers({
          ...(levelFilter != null ? { level: levelFilter } : {}),
          ...(sameLeagueOnly ? { same_league: true } : {}),
          ...(sharedFriendsOnly ? { has_mutuals: true } : {}),
        })
        .then((r: { items?: RawDiscoverItem[] } | RawDiscoverItem[]) => {
          const items = Array.isArray(r) ? r : (r?.items ?? []);
          return items.map(mapDiscoverItem);
        }),
    [levelFilter, sameLeagueOnly, sharedFriendsOnly],
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
    // Optimistic: mark as pending immediately.
    setPendingSendIds((prev) => new Set([...prev, playerId]));
    api.sendFriendRequest(playerId).catch(() => {
      // Roll back on failure.
      setPendingSendIds((prev) => {
        const next = new Set([...prev]);
        next.delete(playerId);
        return next;
      });
    });
  }, []);

  return {
    players,
    isLoadingPlayers,
    playersError,
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
