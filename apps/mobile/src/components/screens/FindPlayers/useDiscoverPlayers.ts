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
import type {
  DiscoverFilters,
  DiscoverPlayer,
  Location,
} from '@beach-kings/shared';
import {
  useFriendshipMutations,
  usePendingFriendRequestPlayerIds,
  socialQueries,
} from '@/features/social';
import { locationQueries } from '@/features/locations';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';
import {
  findNearestHub,
  formatMetroLabel,
  type DiscoverRadius,
} from './discoveryLocation';

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
const EMPTY_LOCATIONS: readonly Location[] = [];

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
  readonly locations: readonly Location[];
  readonly locationsPending: boolean;
  readonly locationsError: Error | null;
  readonly onRetryLocations: () => void;
  readonly metroFilterId: string | null;
  readonly nearMeEnabled: boolean;
  readonly nearMePending: boolean;
  readonly nearMeDenied: boolean;
  readonly nearMeUnavailable: boolean;
  readonly nearMeOriginLabel: string | null;
  readonly radiusMiles: DiscoverRadius;
  readonly onSelectMetro: (locationId: string | null) => void;
  readonly onSelectNearMe: () => void;
  readonly onSetRadius: (radius: DiscoverRadius) => void;
  readonly onClearLocation: () => void;
  readonly hasLocationFilter: boolean;
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
  const [locationMode, setLocationMode] = useState<'all' | 'metro' | 'nearby'>('all');
  const [metroFilterId, setMetroFilterId] = useState<string | null>(null);
  const [radiusMiles, setRadiusMiles] = useState<DiscoverRadius>(25);
  const locationsQuery = useQuery(locationQueries.all());
  const deviceLocation = useDeviceLocation({ enabled: locationMode === 'nearby' });
  const locations = locationsQuery.data ?? EMPTY_LOCATIONS;
  const nearMeOrigin = useMemo(
    () => findNearestHub(locations, deviceLocation.coords),
    [deviceLocation.coords, locations],
  );

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
    ...(locationMode === 'metro' && metroFilterId != null
      ? { location_id: metroFilterId }
      : {}),
    ...(locationMode === 'nearby' && nearMeOrigin != null
      ? {
          origin_location_id: nearMeOrigin.id,
          radius_miles: radiusMiles,
        }
      : {}),
  }), [
    debouncedSearch,
    levelFilter,
    locationMode,
    metroFilterId,
    nearMeOrigin,
    radiusMiles,
    sameLeagueOnly,
    sharedFriendsOnly,
  ]);
  const proximityReady = locationMode !== 'nearby' || nearMeOrigin != null;
  const nearMeDenied =
    locationMode === 'nearby' && deviceLocation.status === 'denied';
  const nearMeUnavailable =
    locationMode === 'nearby'
    && nearMeOrigin == null
    && !nearMeDenied
    && (
      locationsQuery.isError
      || (deviceLocation.status === 'granted' && !locationsQuery.isPending)
    );
  const playersQuery = useQuery(
    socialQueries.discovery(
      userId,
      filters,
      isAuthenticated && proximityReady,
      !proximityReady,
    ),
  );
  const rawPlayers = playersQuery.data;

  // The server applies the search filter, so results are used as-is.
  const players = useMemo<readonly DiscoverPlayer[]>(
    () => (proximityReady ? rawPlayers ?? [] : []),
    [proximityReady, rawPlayers],
  );

  const onRefreshPlayers = useCallback(() => {
    if (!proximityReady) return;
    setIsRefreshingPlayers(true);
    playersQuery.refetch().finally(() => {
      setIsRefreshingPlayers(false);
    });
  }, [playersQuery, proximityReady]);

  const onRetryPlayers = useCallback(() => {
    if (!proximityReady) return;
    void playersQuery.refetch();
  }, [playersQuery, proximityReady]);

  const onToggleLevel = useCallback((level: DiscoverLevel) => {
    setLevelFilter((prev) => (prev === level ? null : level));
  }, []);

  const onToggleSameLeague = useCallback(() => {
    setSameLeagueOnly((prev) => !prev);
  }, []);

  const onToggleSharedFriends = useCallback(() => {
    setSharedFriendsOnly((prev) => !prev);
  }, []);

  const onSelectMetro = useCallback((locationId: string | null) => {
    const normalized = locationId?.trim() || null;
    setMetroFilterId(normalized);
    setLocationMode(normalized == null ? 'all' : 'metro');
  }, []);

  const onSelectNearMe = useCallback(() => {
    setLocationMode('nearby');
  }, []);

  const onClearLocation = useCallback(() => {
    setLocationMode('all');
    setMetroFilterId(null);
  }, []);

  const onAddFriend = useCallback((playerId: number) => {
    void hapticMedium();
    friendshipMutations.send.mutate(playerId);
  }, [friendshipMutations.send]);

  return {
    players,
    isLoadingPlayers: proximityReady ? playersQuery.isPending : false,
    playersError: proximityReady ? playersQuery.error : null,
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
    locations,
    locationsPending: locationsQuery.isPending,
    locationsError: locationsQuery.error,
    onRetryLocations: () => { void locationsQuery.refetch(); },
    metroFilterId: locationMode === 'metro' ? metroFilterId : null,
    nearMeEnabled: locationMode === 'nearby',
    nearMePending:
      locationMode === 'nearby'
      && nearMeOrigin == null
      && !nearMeDenied
      && !nearMeUnavailable,
    nearMeDenied,
    nearMeUnavailable,
    nearMeOriginLabel:
      locationMode === 'nearby' && nearMeOrigin != null
        ? formatMetroLabel(nearMeOrigin)
        : null,
    radiusMiles,
    onSelectMetro,
    onSelectNearMe,
    onSetRadius: setRadiusMiles,
    onClearLocation,
    hasLocationFilter: locationMode !== 'all',
  };
}
