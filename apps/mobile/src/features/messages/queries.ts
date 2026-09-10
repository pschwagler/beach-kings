import { queryOptions } from '@tanstack/react-query';
import type {
  ConversationListResponse,
  Player,
  ThreadResponse,
  MessageFolder,
} from '@beach-kings/shared';
import { api } from '@/lib/api';
import { messageKeys } from './keys';

const MESSAGE_STALE_TIME_MS = 15_000;

export const messageQueries = {
  conversations: (
    userId: number,
    folder: MessageFolder = 'inbox',
    enabled = true,
  ) => queryOptions({
    queryKey: messageKeys.conversations(userId, folder),
    queryFn: ({ signal }): Promise<ConversationListResponse> => api.getConversations(1, 50, folder, { signal }),
    enabled: enabled && userId > 0,
    staleTime: MESSAGE_STALE_TIME_MS,
  }),
  thread: (
    userId: number,
    playerId: number,
    enabled = true,
  ) => queryOptions({
    queryKey: messageKeys.thread(userId, playerId),
    queryFn: ({ signal }): Promise<ThreadResponse> => api.getThread(playerId, 1, 50, { signal }),
    enabled: enabled && userId > 0 && playerId > 0,
    staleTime: MESSAGE_STALE_TIME_MS,
  }),
  unreadCount: (userId: number, enabled = true) => queryOptions({
    queryKey: messageKeys.unreadCount(userId),
    queryFn: ({ signal }) => api.getDmUnreadCount({ signal }),
    enabled: enabled && userId > 0,
    staleTime: MESSAGE_STALE_TIME_MS,
  }),
  peer: (
    userId: number,
    playerId: number,
    enabled = true,
  ) => queryOptions({
    queryKey: messageKeys.peer(userId, playerId),
    queryFn: ({ signal }): Promise<Player> => api.getPublicPlayer(playerId, { signal }),
    enabled: enabled && userId > 0 && playerId > 0,
    staleTime: 30_000,
    // A peer can change or remove their photo while this account is active.
    // Keep cached identity visible, then reconcile from a fresh privacy-gated response.
    refetchOnMount: 'always' as const,
  }),
};
