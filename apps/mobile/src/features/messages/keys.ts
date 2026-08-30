import { privateKeys } from '@/infrastructure/query/keys';
import type { MessageFolder } from '@beach-kings/shared';

export const messageKeys = {
  all: (userId: number) =>
    [...privateKeys.user(userId), 'messages'] as const,
  conversations: (userId: number, folder: MessageFolder = 'inbox') =>
    [...messageKeys.all(userId), 'conversations', folder] as const,
  threads: (userId: number) =>
    [...messageKeys.all(userId), 'threads'] as const,
  thread: (userId: number, playerId: number) =>
    [...messageKeys.threads(userId), playerId] as const,
  unreadCount: (userId: number) =>
    [...messageKeys.all(userId), 'unread-count'] as const,
  peer: (userId: number, playerId: number) =>
    [...messageKeys.all(userId), 'peer', playerId] as const,
};

export const messageMutationKeys = {
  markThreadRead: (userId: number) =>
    [...messageKeys.all(userId), 'mark-thread-read'] as const,
  send: (userId: number) =>
    [...messageKeys.all(userId), 'send'] as const,
  visibility: (userId: number) =>
    [...messageKeys.all(userId), 'visibility'] as const,
};
