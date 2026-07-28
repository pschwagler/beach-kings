import type {
  DiscoverPlayer,
  Friend,
  FriendRequest,
  FriendshipRelationship,
  FriendshipStatus,
} from '@beach-kings/shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  removeFriendRequestNotifications,
  rollbackRemovedNotifications,
  type NotificationMutationInput,
  type RemovedNotificationPatch,
} from '@/features/notifications/cache';
import { socialKeys } from './keys';

interface RelationshipPatch {
  readonly playerId: number;
  readonly previous: FriendshipRelationship | undefined;
  readonly optimistic: FriendshipRelationship;
  readonly optimisticUpdateCount: number;
}

interface DiscoveryPatch {
  readonly queryKey: QueryKey;
  readonly playerId: number;
  readonly previous: DiscoverPlayer;
  readonly optimistic: DiscoverPlayer;
  readonly optimisticUpdateCount: number;
}

interface RemovedRequestPatch {
  readonly queryKey: QueryKey;
  readonly request: FriendRequest;
  /** Entity-local tombstone written by this mutation. */
  readonly optimistic: FriendRequest & {
    readonly __optimisticMutation: string;
  };
}

interface FriendListPatch {
  readonly previous: readonly Friend[];
  readonly optimistic: readonly Friend[];
  readonly optimisticUpdateCount: number;
}

interface FriendCountPatch {
  readonly previous: number;
  readonly optimistic: number;
  readonly optimisticUpdateCount: number;
}

export interface SocialCachePatch {
  readonly token: string;
  readonly relationship?: RelationshipPatch;
  readonly discovery: readonly DiscoveryPatch[];
  readonly requests: readonly RemovedRequestPatch[];
  readonly friends?: FriendListPatch;
  readonly friendCount?: FriendCountPatch;
  readonly notification?: RemovedNotificationPatch;
}

function applyRelationshipStatus(
  queryClient: QueryClient,
  userId: number,
  playerId: number,
  status: FriendshipStatus,
  requestId: number | null,
  token: string,
): Pick<SocialCachePatch, 'relationship' | 'discovery'> {
  const relationshipKey = socialKeys.relationship(userId, playerId);
  const previous = queryClient.getQueryData<FriendshipRelationship>(relationshipKey);
  const optimisticRelationship: FriendshipRelationship = {
    status,
    request_id: requestId,
  };
  queryClient.setQueryData(relationshipKey, optimisticRelationship);
  const storedRelationship = queryClient.getQueryData<FriendshipRelationship>(
    relationshipKey,
  ) ?? optimisticRelationship;

  const discovery: DiscoveryPatch[] = [];
  for (const [queryKey, players] of queryClient.getQueriesData<DiscoverPlayer[]>({
    queryKey: socialKeys.discoveryRoot(userId),
  })) {
    const player = players?.find((candidate) => candidate.player_id === playerId);
    if (player == null) continue;
    const optimistic: DiscoverPlayer = {
      ...player,
      friend_status: status,
      request_id: requestId,
    };
    queryClient.setQueryData<DiscoverPlayer[]>(queryKey, (current) =>
      current?.map((candidate) =>
        candidate.player_id === playerId ? optimistic : candidate),
    );
    const stored = queryClient.getQueryData<DiscoverPlayer[]>(queryKey)
      ?.find((candidate) => candidate.player_id === playerId) ?? optimistic;
    discovery.push({
      queryKey,
      playerId,
      previous: player,
      optimistic: stored,
      optimisticUpdateCount:
        queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0,
    });
  }
  return {
    relationship: {
      playerId,
      previous,
      optimistic: storedRelationship,
      optimisticUpdateCount:
        queryClient.getQueryState(relationshipKey)?.dataUpdateCount ?? 0,
    },
    discovery,
  };
}

function findCounterpartId(
  queryClient: QueryClient,
  userId: number,
  requestId: number,
  counterpart: 'sender' | 'receiver',
): number | undefined {
  for (const [, requests] of queryClient.getQueriesData<FriendRequest[]>({
    queryKey: socialKeys.requestsRoot(userId),
  })) {
    const request = requests?.find((candidate) => candidate.id === requestId);
    if (request != null) {
      return counterpart === 'sender'
        ? request.sender_player_id
        : request.receiver_player_id;
    }
  }
  return undefined;
}

function removeRequest(
  queryClient: QueryClient,
  userId: number,
  requestId: number,
  terminalStatus: 'accepted' | 'rejected',
  token: string,
): RemovedRequestPatch[] {
  const patches: RemovedRequestPatch[] = [];
  for (const [queryKey, requests] of queryClient.getQueriesData<FriendRequest[]>({
    queryKey: socialKeys.requestsRoot(userId),
  })) {
    const request = requests?.find((candidate) => candidate.id === requestId);
    if (requests == null || request == null) continue;
    const optimistic = {
      ...request,
      status: terminalStatus,
      __optimisticMutation: token,
    };
    queryClient.setQueryData<FriendRequest[]>(queryKey, (current) =>
      current?.map((candidate) =>
        candidate.id === requestId ? optimistic : candidate,
      ),
    );
    const stored = queryClient.getQueryData<Array<typeof optimistic>>(queryKey)
      ?.find((candidate) => candidate.id === requestId) ?? optimistic;
    patches.push({
      queryKey,
      request,
      optimistic: stored,
    });
  }
  return patches;
}

export function applySendFriendRequest(
  queryClient: QueryClient,
  userId: number,
  playerId: number,
  token: string,
): SocialCachePatch {
  const relationship = applyRelationshipStatus(
    queryClient,
    userId,
    playerId,
    'pending_outgoing',
    null,
    token,
  );
  return { token, ...relationship, requests: [] };
}

/** Optimistically remove one accepted friendship from every social surface. */
export function applyRemoveFriend(
  queryClient: QueryClient,
  userId: number,
  playerId: number,
  token: string,
): SocialCachePatch {
  const relationship = applyRelationshipStatus(
    queryClient,
    userId,
    playerId,
    'none',
    null,
    token,
  );

  const friendsKey = socialKeys.friends(userId);
  const previousFriends = queryClient.getQueryData<Friend[]>(friendsKey);
  let friends: FriendListPatch | undefined;
  if (previousFriends?.some((friend) => friend.player_id === playerId)) {
    const optimistic = previousFriends.filter(
      (friend) => friend.player_id !== playerId,
    );
    queryClient.setQueryData(friendsKey, optimistic);
    friends = {
      previous: previousFriends,
      optimistic:
        queryClient.getQueryData<Friend[]>(friendsKey) ?? optimistic,
      optimisticUpdateCount:
        queryClient.getQueryState(friendsKey)?.dataUpdateCount ?? 0,
    };
  }

  const friendCountKey = socialKeys.friendCount(userId);
  const previousCount = queryClient.getQueryData<number>(friendCountKey);
  let friendCount: FriendCountPatch | undefined;
  if (previousCount != null && previousCount > 0) {
    const optimistic = previousCount - 1;
    queryClient.setQueryData(friendCountKey, optimistic);
    friendCount = {
      previous: previousCount,
      optimistic:
        queryClient.getQueryData<number>(friendCountKey) ?? optimistic,
      optimisticUpdateCount:
        queryClient.getQueryState(friendCountKey)?.dataUpdateCount ?? 0,
    };
  }

  return {
    token,
    ...relationship,
    requests: [],
    ...(friends != null ? { friends } : {}),
    ...(friendCount != null ? { friendCount } : {}),
  };
}

export function applyResolveFriendRequest(
  queryClient: QueryClient,
  userId: number,
  input: NotificationMutationInput & { readonly playerId?: number },
  counterpart: 'sender' | 'receiver',
  status: FriendshipStatus,
  token: string,
): SocialCachePatch {
  const playerId = input.playerId ?? findCounterpartId(
    queryClient,
    userId,
    input.requestId,
    counterpart,
  );
  const requests = removeRequest(
    queryClient,
    userId,
    input.requestId,
    status === 'friend' ? 'accepted' : 'rejected',
    token,
  );
  const relationship = playerId == null
    ? { relationship: undefined, discovery: [] }
    : applyRelationshipStatus(queryClient, userId, playerId, status, null, token);
  const notification = removeFriendRequestNotifications(
    queryClient,
    userId,
    input,
    token,
  );
  return { token, ...relationship, requests, notification };
}

export function rollbackSocialCachePatch(
  queryClient: QueryClient,
  userId: number,
  patch: SocialCachePatch | undefined,
): void {
  if (patch == null) return;
  if (patch.relationship != null) {
    const key = socialKeys.relationship(userId, patch.relationship.playerId);
    const current = queryClient.getQueryData<FriendshipRelationship>(key);
    const updateCount = queryClient.getQueryState(key)?.dataUpdateCount;
    if (
      current === patch.relationship.optimistic &&
      updateCount === patch.relationship.optimisticUpdateCount
    ) {
      if (patch.relationship.previous == null) {
        queryClient.removeQueries({ queryKey: key, exact: true });
      } else {
        queryClient.setQueryData(key, patch.relationship.previous);
      }
    }
  }
  for (const discovery of patch.discovery) {
    if (
      queryClient.getQueryState(discovery.queryKey)?.dataUpdateCount !==
      discovery.optimisticUpdateCount
    ) {
      continue;
    }
    queryClient.setQueryData<DiscoverPlayer[]>(
      discovery.queryKey,
      (current) => current?.map((player) =>
        player.player_id === discovery.playerId &&
        player === discovery.optimistic
          ? discovery.previous
          : player),
    );
  }
  for (const removed of patch.requests) {
    queryClient.setQueryData<FriendRequest[]>(removed.queryKey, (current) =>
      current?.map((request) =>
        request === removed.optimistic ? removed.request : request,
      ),
    );
  }
  if (patch.friends != null) {
    const key = socialKeys.friends(userId);
    const current = queryClient.getQueryData<readonly Friend[]>(key);
    const updateCount = queryClient.getQueryState(key)?.dataUpdateCount;
    if (
      current === patch.friends.optimistic &&
      updateCount === patch.friends.optimisticUpdateCount
    ) {
      queryClient.setQueryData(key, patch.friends.previous);
    }
  }
  if (patch.friendCount != null) {
    const key = socialKeys.friendCount(userId);
    const current = queryClient.getQueryData<number>(key);
    const updateCount = queryClient.getQueryState(key)?.dataUpdateCount;
    if (
      current === patch.friendCount.optimistic &&
      updateCount === patch.friendCount.optimisticUpdateCount
    ) {
      queryClient.setQueryData(key, patch.friendCount.previous);
    }
  }
  if (patch.notification != null) {
    rollbackRemovedNotifications(queryClient, userId, patch.notification);
  }
}
