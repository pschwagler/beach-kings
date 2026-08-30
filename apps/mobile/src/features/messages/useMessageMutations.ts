import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Conversation,
  ConversationListResponse,
  DirectMessage,
  ThreadResponse,
} from '@beach-kings/shared';
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

function nextVisibilityToken(playerId: number): string {
  optimisticSequence += 1;
  return `thread-visibility:${playerId}:${optimisticSequence}`;
}

type OptimisticVisibilityConversation = Conversation & {
  readonly __optimisticVisibilityToken?: string;
};

type OptimisticVisibilityThread = ThreadResponse & {
  readonly __optimisticVisibilityToken?: string;
};

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

  const setConversationHidden = useMutation({
    mutationKey: messageMutationKeys.visibility(userId),
    mutationFn: ({ playerId, hidden }: { readonly playerId: number; readonly hidden: boolean }) =>
      api.setConversationHidden(playerId, hidden),
    onMutate: async ({ playerId, hidden }) => {
      await queryClient.cancelQueries({ queryKey: messageKeys.all(userId) });
      const token = nextVisibilityToken(playerId);
      const inboxKey = messageKeys.conversations(userId, 'inbox');
      const hiddenKey = messageKeys.conversations(userId, 'hidden');
      const threadKey = messageKeys.thread(userId, playerId);
      const previousThread = queryClient.getQueryData<ThreadResponse>(threadKey);
      const sourceKey = hidden ? inboxKey : hiddenKey;
      const destinationKey = hidden ? hiddenKey : inboxKey;
      const source = queryClient.getQueryData<ConversationListResponse>(sourceKey);
      const destination = queryClient.getQueryData<ConversationListResponse>(destinationKey);
      const conversation = source?.items.find((item) => item.player_id === playerId);

      if (conversation != null && destination != null) {
        const optimisticConversation: OptimisticVisibilityConversation = {
          ...conversation,
          is_hidden: hidden,
          unread_count: hidden ? 0 : conversation.unread_count,
          __optimisticVisibilityToken: token,
        };
        queryClient.setQueryData<ConversationListResponse>(sourceKey, (current) =>
          current == null ? current : {
            ...current,
            items: current.items.filter((item) => item.player_id !== playerId),
            total_count: Math.max(0, current.total_count - 1),
          },
        );
        queryClient.setQueryData<ConversationListResponse>(destinationKey, (current) => {
          if (current == null) return current;
          return {
            ...current,
            items: [
              optimisticConversation,
              ...current.items.filter((item) => item.player_id !== playerId),
            ],
            total_count: current.items.some((item) => item.player_id === playerId)
              ? current.total_count
              : current.total_count + 1,
          };
        });
      }
      queryClient.setQueryData<ThreadResponse>(
        threadKey,
        (thread) => thread == null ? thread : {
          ...thread,
          is_hidden: hidden,
          __optimisticVisibilityToken: token,
        } as OptimisticVisibilityThread,
      );
      return {
        token,
        playerId,
        hidden,
        previousConversation: conversation,
        movedConversation: conversation != null && destination != null,
        previousThreadHidden: previousThread?.is_hidden ?? false,
      };
    },
    onError: (_error, _variables, context) => {
      if (context == null) return;
      const sourceKey = messageKeys.conversations(
        userId,
        context.hidden ? 'inbox' : 'hidden',
      );
      const destinationKey = messageKeys.conversations(
        userId,
        context.hidden ? 'hidden' : 'inbox',
      );
      let conversationToRestore: Conversation | undefined;

      if (context.movedConversation) {
        queryClient.setQueryData<ConversationListResponse>(
          destinationKey,
          (current) => {
            if (current == null) return current;
            const optimistic = current.items.find(
              (item) =>
                item.player_id === context.playerId &&
                (item as OptimisticVisibilityConversation)
                  .__optimisticVisibilityToken === context.token,
            ) as OptimisticVisibilityConversation | undefined;
            if (optimistic == null) return current;
            const {
              __optimisticVisibilityToken: _token,
              ...latestConversation
            } = optimistic;
            conversationToRestore = {
              ...latestConversation,
              is_hidden: !context.hidden,
              unread_count:
                context.hidden && latestConversation.unread_count === 0
                  ? context.previousConversation?.unread_count ?? 0
                  : latestConversation.unread_count,
            };
            return {
              ...current,
              items: current.items.filter(
                (item) => item.player_id !== context.playerId,
              ),
              total_count: Math.max(0, current.total_count - 1),
            };
          },
        );
        if (conversationToRestore != null) {
          queryClient.setQueryData<ConversationListResponse>(
            sourceKey,
            (current) => {
              if (current == null) return current;
              if (current.items.some((item) => item.player_id === context.playerId)) {
                return current;
              }
              return {
                ...current,
                items: [conversationToRestore!, ...current.items],
                total_count: current.total_count + 1,
              };
            },
          );
        }
      }

      queryClient.setQueryData<ThreadResponse>(
        messageKeys.thread(userId, context.playerId),
        (current) => {
          const optimistic = current as OptimisticVisibilityThread | undefined;
          if (
            optimistic?.__optimisticVisibilityToken !== context.token ||
            context.previousThreadHidden == null
          ) {
            return current;
          }
          const {
            __optimisticVisibilityToken: _token,
            ...latestThread
          } = optimistic;
          return {
            ...latestThread,
            is_hidden: context.previousThreadHidden,
          };
        },
      );
    },
    onSuccess: (_result, _variables, context) => {
      if (context == null) return;
      const destinationKey = messageKeys.conversations(
        userId,
        context.hidden ? 'hidden' : 'inbox',
      );
      queryClient.setQueryData<ConversationListResponse>(destinationKey, (current) =>
        current == null ? current : {
          ...current,
          items: current.items.map((item) => {
            const optimistic = item as OptimisticVisibilityConversation;
            if (optimistic.__optimisticVisibilityToken !== context.token) {
              return item;
            }
            const { __optimisticVisibilityToken: _token, ...committed } = optimistic;
            return committed;
          }),
        },
      );
      queryClient.setQueryData<ThreadResponse>(
        messageKeys.thread(userId, context.playerId),
        (current) => {
          const optimistic = current as OptimisticVisibilityThread | undefined;
          if (optimistic?.__optimisticVisibilityToken !== context.token) {
            return current;
          }
          const { __optimisticVisibilityToken: _token, ...committed } = optimistic;
          return committed;
        },
      );
    },
    onSettled: (_result, _error, { playerId }) => Promise.all([
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations(userId, 'inbox') }),
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations(userId, 'hidden') }),
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(userId, playerId) }),
      queryClient.invalidateQueries({ queryKey: messageKeys.unreadCount(userId) }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.feed(userId) }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(userId) }),
    ]),
  });

  return { markThreadRead, sendMessage, setConversationHidden };
}
