import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DirectMessage, ThreadResponse } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { notificationKeys } from '@/features/notifications/keys';
import { api } from '@/lib/api';
import {
  applyMarkThreadRead,
  commitMarkThreadRead,
  rollbackMarkThreadRead,
  upsertThreadMessage,
} from './cache';
import { messageKeys, messageMutationKeys } from './keys';

let optimisticSequence = 0;

function nextToken(playerId: number): string {
  optimisticSequence += 1;
  return `thread-read:${playerId}:${optimisticSequence}`;
}

export function useMessageMutations() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();

  const markThreadRead = useMutation({
    mutationKey: messageMutationKeys.markThreadRead(userId),
    mutationFn: (playerId: number) => api.markThreadRead(playerId),
    onMutate: async (playerId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: messageKeys.all(userId) }),
        queryClient.cancelQueries({
          queryKey: notificationKeys.feed(userId),
        }),
        queryClient.cancelQueries({
          queryKey: notificationKeys.unreadCount(userId),
        }),
      ]);
      return applyMarkThreadRead(
        queryClient,
        userId,
        playerId,
        nextToken(playerId),
      );
    },
    onError: (_error, _playerId, patch) => {
      rollbackMarkThreadRead(queryClient, userId, patch);
    },
    onSuccess: (_response, _playerId, patch) => {
      commitMarkThreadRead(queryClient, userId, patch);
    },
    onSettled: (_response, _error, playerId) => Promise.all([
      queryClient.invalidateQueries({
        queryKey: messageKeys.conversations(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: messageKeys.thread(userId, playerId),
      }),
      queryClient.invalidateQueries({
        queryKey: messageKeys.unreadCount(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: notificationKeys.feed(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(userId),
      }),
    ]),
  });

  const sendMessage = useMutation({
    mutationKey: messageMutationKeys.send(userId),
    mutationFn: ({
      playerId,
      text,
    }: {
      readonly playerId: number;
      readonly text: string;
    }) => api.sendDirectMessage(playerId, text),
    onSuccess: (message: DirectMessage, { playerId }) => {
      queryClient.setQueryData<ThreadResponse>(
        messageKeys.thread(userId, playerId),
        (thread) => upsertThreadMessage(thread, message),
      );
    },
    onSettled: (_message, _error, { playerId }) => Promise.all([
      queryClient.invalidateQueries({
        queryKey: messageKeys.conversations(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: messageKeys.thread(userId, playerId),
      }),
    ]),
  });

  return { markThreadRead, sendMessage };
}
