import { useMemo } from 'react';
import {
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { FriendRequest, Notification } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  notificationQueryKeys,
  socialMutationKeys,
  socialQueryKeys,
} from '@/lib/socialQueryKeys';
import type { DiscoverPlayer } from '@/lib/socialApi';

interface MutationSnapshot {
  readonly entries: ReadonlyArray<readonly [QueryKey, unknown]>;
}

export interface FriendRequestMutationInput {
  readonly requestId: number;
  readonly playerId?: number;
  readonly notificationId?: number;
}

function notificationRequestId(notification: Notification): number | null {
  const value = notification.data?.friend_request_id ?? notification.data?.request_id;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isAlreadyResolved(error: unknown): boolean {
  const detail =
    (error as { response?: { data?: { detail?: unknown } } })?.response?.data
      ?.detail ?? (error instanceof Error ? error.message : null);
  return typeof detail === 'string' &&
    /no longer pending|not found|already friends/i.test(detail);
}

function restoreSnapshot(
  queryClient: QueryClient,
  userId: number,
  snapshot: MutationSnapshot | undefined,
): void {
  // Remove optimistic entries that did not exist before the mutation (for
  // example, a profile relationship first created by an Add Friend tap).
  queryClient.removeQueries({ queryKey: socialQueryKeys.all(userId) });
  queryClient.removeQueries({ queryKey: notificationQueryKeys.all(userId) });
  for (const [key, value] of snapshot?.entries ?? []) {
    queryClient.setQueryData(key, value);
  }
}

function updateDiscoveryStatus(
  queryClient: QueryClient,
  userId: number,
  playerId: number | undefined,
  status: DiscoverPlayer['friend_status'],
  requestId: number | null,
): void {
  if (playerId == null) return;
  queryClient.setQueryData(
    socialQueryKeys.relationship(userId, playerId),
    { status, request_id: requestId },
  );
  queryClient.setQueriesData<DiscoverPlayer[]>(
    { queryKey: [...socialQueryKeys.all(userId), 'discovery'] },
    (players) => players?.map((player) =>
      player.player_id === playerId
        ? { ...player, friend_status: status, request_id: requestId }
        : player,
    ),
  );
}

function removeRequest(
  queryClient: QueryClient,
  userId: number,
  input: FriendRequestMutationInput,
  counterpart: 'sender' | 'receiver',
): number | undefined {
  let counterpartId = input.playerId;
  queryClient.setQueriesData<FriendRequest[]>(
    { queryKey: [...socialQueryKeys.all(userId), 'requests'] },
    (requests) => {
      if (counterpartId == null) {
        const request = requests?.find((item) => item.id === input.requestId);
        counterpartId = counterpart === 'sender'
          ? request?.sender_player_id
          : request?.receiver_player_id;
      }
      return requests?.filter((request) => request.id !== input.requestId);
    },
  );
  return counterpartId;
}

function removeRequestNotification(
  queryClient: QueryClient,
  userId: number,
  input: FriendRequestMutationInput,
): void {
  queryClient.setQueryData<Notification[]>(
    notificationQueryKeys.feed(userId),
    (notifications) => {
      const removedUnreadCount = (notifications ?? []).filter((notification) =>
        !notification.is_read && (
          notification.id === input.notificationId ||
          notificationRequestId(notification) === input.requestId
        ),
      ).length;
      if (removedUnreadCount > 0) {
        queryClient.setQueryData<{ count: number }>(
          notificationQueryKeys.unreadCount(userId),
          (current) => ({ count: Math.max(0, (current?.count ?? 0) - removedUnreadCount) }),
        );
      }
      return notifications?.filter((notification) =>
        notification.id !== input.notificationId &&
        notificationRequestId(notification) !== input.requestId,
      );
    },
  );
}

async function optimisticSnapshot(queryClient: QueryClient, userId: number): Promise<MutationSnapshot> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: socialQueryKeys.all(userId) }),
    queryClient.cancelQueries({ queryKey: notificationQueryKeys.all(userId) }),
  ]);
  return {
    entries: [
      ...queryClient.getQueriesData({ queryKey: socialQueryKeys.all(userId) }),
      ...queryClient.getQueriesData({ queryKey: notificationQueryKeys.all(userId) }),
    ],
  };
}

export function useFriendshipMutations() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const serialScope = { id: `social-relationship-${userId}` };

  const invalidate = async (includeNotifications = true) => {
    if (userId === 0) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: socialQueryKeys.all(userId) }),
      ...(includeNotifications
        ? [queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all(userId) })]
        : []),
    ]);
  };

  const send = useMutation({
    mutationKey: socialMutationKeys.send(userId),
    scope: serialScope,
    mutationFn: (playerId: number) => api.sendFriendRequest(playerId),
    onMutate: async (playerId): Promise<MutationSnapshot> => {
      const snapshot = await optimisticSnapshot(queryClient, userId);
      updateDiscoveryStatus(queryClient, userId, playerId, 'pending_outgoing', null);
      return snapshot;
    },
    onError: (_error, _variables, snapshot) =>
      restoreSnapshot(queryClient, userId, snapshot),
    onSettled: () => invalidate(),
  });

  const accept = useMutation({
    mutationKey: socialMutationKeys.accept(userId),
    scope: serialScope,
    mutationFn: (input: FriendRequestMutationInput) =>
      api.acceptFriendRequest(input.requestId),
    onMutate: async (input): Promise<MutationSnapshot> => {
      const snapshot = await optimisticSnapshot(queryClient, userId);
      const playerId = removeRequest(queryClient, userId, input, 'sender');
      updateDiscoveryStatus(queryClient, userId, playerId, 'friend', null);
      removeRequestNotification(queryClient, userId, input);
      return snapshot;
    },
    onError: (error, _variables, snapshot) => {
      if (!isAlreadyResolved(error)) restoreSnapshot(queryClient, userId, snapshot);
    },
    onSettled: (_data, error) => invalidate(!isAlreadyResolved(error)),
  });

  const decline = useMutation({
    mutationKey: socialMutationKeys.decline(userId),
    scope: serialScope,
    mutationFn: (input: FriendRequestMutationInput) =>
      api.declineFriendRequest(input.requestId),
    onMutate: async (input): Promise<MutationSnapshot> => {
      const snapshot = await optimisticSnapshot(queryClient, userId);
      const playerId = removeRequest(queryClient, userId, input, 'sender');
      updateDiscoveryStatus(queryClient, userId, playerId, 'none', null);
      removeRequestNotification(queryClient, userId, input);
      return snapshot;
    },
    onError: (error, _variables, snapshot) => {
      if (!isAlreadyResolved(error)) restoreSnapshot(queryClient, userId, snapshot);
    },
    onSettled: (_data, error) => invalidate(!isAlreadyResolved(error)),
  });

  const cancel = useMutation({
    mutationKey: socialMutationKeys.cancel(userId),
    scope: serialScope,
    mutationFn: (input: FriendRequestMutationInput) =>
      api.cancelFriendRequest(input.requestId),
    onMutate: async (input): Promise<MutationSnapshot> => {
      const snapshot = await optimisticSnapshot(queryClient, userId);
      const playerId = removeRequest(queryClient, userId, input, 'receiver');
      updateDiscoveryStatus(queryClient, userId, playerId, 'none', null);
      removeRequestNotification(queryClient, userId, input);
      return snapshot;
    },
    onError: (_error, _variables, snapshot) =>
      restoreSnapshot(queryClient, userId, snapshot),
    onSettled: () => invalidate(),
  });

  return useMemo(() => ({ send, accept, decline, cancel }), [send, accept, decline, cancel]);
}

export function usePendingFriendRequestPlayerIds(): ReadonlySet<number> {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const playerIds = useMutationState<number>({
    filters: { mutationKey: socialMutationKeys.send(userId), status: 'pending' },
    select: (mutation) => mutation.state.variables as number,
  });
  return useMemo(() => new Set(playerIds), [playerIds]);
}
