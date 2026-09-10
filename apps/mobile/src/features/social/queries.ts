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
import { isAccessRevokedError } from '@/lib/apiError';
import { socialKeys } from './keys';

const SOCIAL_STALE_TIME_MS = 30_000;

export interface PlayerProfileDetails {
  readonly player: Player;
  readonly mutualFriends: readonly MutualFriend[];
  readonly leagues: readonly PlayerLeague[];
  readonly refreshIncomplete?: boolean;
}

export const socialQueries = {
  friends: (userId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.friends(userId),
    queryFn: ({ signal }) => api.getFriends(undefined, { signal }),
    enabled: enabled && userId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  friendCount: (userId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.friendCount(userId),
    queryFn: async ({ signal }): Promise<number> => {
      const response = await api.getFriendsPage({ page: 1, page_size: 1 }, { signal });
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
    queryFn: ({ signal }) => api.getFriendRequests(direction, { signal }),
    // Resolved requests remain in the raw cache briefly as entity-local
    // optimistic tombstones. Observers only expose server-pending requests.
    select: (requests) => requests.filter((request) => request.status === 'pending'),
    enabled: enabled && userId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  suggestions: (userId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.suggestions(userId),
    queryFn: ({ signal }) => api.getFriendSuggestions({ signal }),
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
    queryFn: unresolvedNearby ? skipToken : ({ signal }) => api.discoverPlayers(filters, { signal }),
    enabled: enabled && userId > 0 && !unresolvedNearby,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),

  relationship: (userId: number, playerId: number, enabled = true) => queryOptions({
    queryKey: socialKeys.relationship(userId, playerId),
    queryFn: async ({ signal }): Promise<FriendshipRelationship> => {
      const response = await api.batchFriendStatus([playerId], { signal });
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
    queryFn: async ({ signal, client, queryKey }): Promise<PlayerProfileDetails> => {
      const previous = client.getQueryData<PlayerProfileDetails>(queryKey);
      const results = await Promise.allSettled([
        api.getPublicPlayer(playerId, { signal }),
        api.getMutualFriends(playerId, { signal }),
        api.getPlayerLeagues(playerId, { signal }),
      ]);
      // Access revocation wins even if a different section failed transiently.
      const denied = results.find(result => result.status === 'rejected' && isAccessRevokedError(result.reason));
      if (denied?.status === 'rejected') throw denied.reason;
      const [player, mutualFriends, leagues] = results;
      if (player.status === 'rejected') throw player.reason;
      return {
        player: player.value as Player,
        mutualFriends: mutualFriends.status === 'fulfilled' ? mutualFriends.value : previous?.mutualFriends ?? [],
        leagues: leagues.status === 'fulfilled' ? leagues.value : previous?.leagues ?? [],
        refreshIncomplete: mutualFriends.status === 'rejected' || leagues.status === 'rejected',
      };
    },
    enabled: enabled && userId > 0 && Number.isFinite(playerId) && playerId > 0,
    staleTime: SOCIAL_STALE_TIME_MS,
  }),
};
