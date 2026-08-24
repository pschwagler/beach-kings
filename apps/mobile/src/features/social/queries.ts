import { queryOptions, skipToken } from '@tanstack/react-query';
import type {
  DiscoverFilters,
  DiscoverPlayer,
  FriendRequestDirection,
  FriendshipRelationship,
  MutualFriend,
  Player,
  PlayerLeague,
} from '@beach-kings/shared';
import { api } from '@/lib/api';
import { socialKeys } from './keys';

const SOCIAL_STALE_TIME_MS = 30_000;

export interface PlayerProfileDetails {
  readonly player: Player;
  readonly mutualFriends: readonly MutualFriend[];
  readonly leagues: readonly PlayerLeague[];
}

export const socialQueries = {
  friends: (userId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.friends(userId),
    queryFn: () => api.getFriends(),
    enabled: enabled && userId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  friendCount: (userId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.friendCount(userId),
    queryFn: async (): Promise<number> => {
      const response = await api.getFriendsPage({ page: 1, page_size: 1 });
      return response.total_count;
    },
    enabled: enabled && userId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  requests: (
    userId: number,
    direction: FriendRequestDirection = 'both',
    enabled = true,
  ) => queryOptions({
    queryKey: socialKeys.requests(userId, direction),
    queryFn: () => api.getFriendRequests(direction),
    // Resolved requests remain in the raw cache briefly as entity-local
    // optimistic tombstones. Observers only expose server-pending requests.
    select: (requests) => requests.filter((request) => request.status === 'pending'),
    enabled: enabled && userId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  suggestions: (userId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.suggestions(userId),
    queryFn: () => api.getFriendSuggestions(),
    enabled: enabled && userId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  discovery: (
    userId: number,
    filters: DiscoverFilters,
    enabled = true,
    unresolvedNearby = false,
  ) => queryOptions<DiscoverPlayer[]>({
    queryKey: unresolvedNearby
      ? [...socialKeys.discoveryRoot(userId), 'nearby-unresolved']
      : socialKeys.discovery(userId, filters),
    queryFn: unresolvedNearby ? skipToken : () => api.discoverPlayers(filters),
    enabled: enabled && userId > 0 && !unresolvedNearby,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  relationship: (userId: number, playerId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.relationship(userId, playerId),
    queryFn: async (): Promise<FriendshipRelationship> => {
      const response = await api.batchFriendStatus([playerId]);
      return response.relationships[String(playerId)] ?? {
        status: 'none',
        request_id: null,
      };
    },
    enabled: enabled && userId > 0 && playerId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  profile: (userId: number, playerId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.profile(userId, playerId),
    queryFn: async (): Promise<PlayerProfileDetails> => {
      const [player, mutualFriends, leagues] = await Promise.all([
        api.getPublicPlayer(playerId),
        api.getMutualFriends(playerId).catch(() => [] as MutualFriend[]),
        api.getPlayerLeagues(playerId).catch(() => [] as PlayerLeague[]),
      ]);
      return {
        player: player as Player,
        mutualFriends,
        leagues: leagues as PlayerLeague[],
      };
    },
    enabled: enabled && userId > 0 && Number.isFinite(playerId) && playerId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),
};
