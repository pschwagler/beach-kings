import { queryOptions } from '@tanstack/react-query';
import type {
  ConversationListResponse,
  Player,
  ThreadResponse,
} from '@beach-kings/shared';
import { api } from '@/lib/api';
import { messageKeys } from './keys';

const MESSAGE_STALE_TIME_MS = 15_000;

export const messageQueries = {
  conversations: (userId: number, enabled = true) => queryOptions({
    queryKey: messageKeys.conversations(userId),
    queryFn: (): Promise<ConversationListResponse> => api.getConversations(),
    enabled: enabled && userId > 0,
    staleTime: MESSAGE_STALE_TIME_MS,
  }),
  thread: (
    userId: number,
    playerId: number,
    enabled = true,
  ) => queryOptions({
    queryKey: messageKeys.thread(userId, playerId),
    queryFn: (): Promise<ThreadResponse> => api.getThread(playerId),
    enabled: enabled && userId > 0 && playerId > 0,
    staleTime: MESSAGE_STALE_TIME_MS,
  }),
  unreadCount: (userId: number, enabled = true) => queryOptions({
    queryKey: messageKeys.unreadCount(userId),
    queryFn: () => api.getDmUnreadCount(),
    enabled: enabled && userId > 0,
    staleTime: MESSAGE_STALE_TIME_MS,
  }),
  peer: (
    userId: number,
    playerId: number,
    enabled = true,
  ) => queryOptions({
    queryKey: messageKeys.peer(userId, playerId),
    queryFn: (): Promise<Player> => api.getPublicPlayer(playerId),
    enabled: enabled && userId > 0 && playerId > 0,
    staleTime: 30_000,
  }),
};
