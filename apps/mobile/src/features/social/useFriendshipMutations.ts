import { useMemo } from 'react';
import {
  useMutation,
  useMutationState,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { notificationKeys } from '@/features/notifications/keys';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  applyRemoveFriend,
  applyResolveFriendRequest,
  applySendFriendRequest,
  rollbackSocialCachePatch,
  type SocialCachePatch,
} from './cache';
import { socialKeys, socialMutationKeys } from './keys';

export interface FriendRequestMutationInput {
  readonly requestId: number;
  readonly playerId?: number;
  readonly notificationId?: number;
}

let optimisticSequence = 0;

function nextOptimisticToken(action: string): string {
  optimisticSequence += 1;
  return `${action}:${optimisticSequence}`;
}

function isAlreadyResolved(error: unknown): boolean {
  return /no longer pending|not found|already friends|not friends with/i.test(
    getApiErrorMessage(error, ''),
  );
}

export function useFriendshipMutations() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const serialScope = { id: `social-relationship-${userId}` };

  const invalidate = async (includeNotifications = true) => {
    if (userId === 0) return;
    await Promise.all([
      // A notification action may not carry its counterpart's player id. The
      // domain prefix still targets only this user's social cache while also
      // covering any open profile/relationship query that must reconcile.
      queryClient.invalidateQueries({ queryKey: socialKeys.all(userId) }),
      ...(includeNotifications ? [
        queryClient.invalidateQueries({ queryKey: notificationKeys.all(userId) }),
      ] : []),
    ]);
  };

  const send = useMutation({
    mutationKey: socialMutationKeys.send(userId),
    scope: serialScope,
    mutationFn: (playerId: number) => api.sendFriendRequest(playerId),
    onMutate: async (playerId): Promise<SocialCachePatch> => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: socialKeys.relationship(userId, playerId) }),
        queryClient.cancelQueries({ queryKey: socialKeys.discoveryRoot(userId) }),
      ]);
      return applySendFriendRequest(
        queryClient,
        userId,
        playerId,
        nextOptimisticToken('send'),
      );
    },
    onError: (_error, _variables, patch) =>
      rollbackSocialCachePatch(queryClient, userId, patch),
    onSettled: () => invalidate(),
  });

  const resolveOptions = (
    action: 'accept' | 'decline' | 'cancel',
    counterpart: 'sender' | 'receiver',
    status: 'friend' | 'none',
    mutationFn: (requestId: number) => Promise<unknown>,
  ) => ({
    mutationKey: socialMutationKeys[action](userId),
    scope: serialScope,
    mutationFn: (input: FriendRequestMutationInput) => mutationFn(input.requestId),
    onMutate: async (input: FriendRequestMutationInput): Promise<SocialCachePatch> => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: socialKeys.requestsRoot(userId) }),
        queryClient.cancelQueries({ queryKey: socialKeys.discoveryRoot(userId) }),
        queryClient.cancelQueries({ queryKey: notificationKeys.feed(userId) }),
        queryClient.cancelQueries({ queryKey: notificationKeys.unreadCount(userId) }),
      ]);
      return applyResolveFriendRequest(
        queryClient,
        userId,
        input,
        counterpart,
        status,
        nextOptimisticToken(action),
      );
    },
    onError: (
      error: unknown,
      _input: FriendRequestMutationInput,
      patch: SocialCachePatch | undefined,
    ) => {
      if (!isAlreadyResolved(error)) rollbackSocialCachePatch(queryClient, userId, patch);
    },
    onSettled: (
      _data: unknown,
      error: unknown,
      _input: FriendRequestMutationInput,
    ) => invalidate(!isAlreadyResolved(error)),
  });

  const accept = useMutation(resolveOptions(
    'accept',
    'sender',
    'friend',
    (requestId) => api.acceptFriendRequest(requestId),
  ));
  const decline = useMutation(resolveOptions(
    'decline',
    'sender',
    'none',
    (requestId) => api.declineFriendRequest(requestId),
  ));
  const cancel = useMutation(resolveOptions(
    'cancel',
    'receiver',
    'none',
    (requestId) => api.cancelFriendRequest(requestId),
  ));
  const remove = useMutation({
    mutationKey: socialMutationKeys.remove(userId),
    scope: serialScope,
    mutationFn: (playerId: number) => api.removeFriend(playerId),
    onMutate: async (playerId): Promise<SocialCachePatch> => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: socialKeys.relationship(userId, playerId),
        }),
        queryClient.cancelQueries({
          queryKey: socialKeys.discoveryRoot(userId),
        }),
        queryClient.cancelQueries({
          queryKey: socialKeys.friends(userId),
        }),
      ]);
      return applyRemoveFriend(
        queryClient,
        userId,
        playerId,
        nextOptimisticToken('remove'),
      );
    },
    onError: (error, _playerId, patch) => {
      // A repeated removal is already in the desired terminal state.
      if (!isAlreadyResolved(error)) {
        rollbackSocialCachePatch(queryClient, userId, patch);
      }
    },
    onSettled: () => invalidate(false),
  });

  return useMemo(
    () => ({ send, accept, decline, cancel, remove }),
    [send, accept, decline, cancel, remove],
  );
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
