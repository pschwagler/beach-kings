import { privateKeys } from '@/infrastructure/query/keys';

export const messageKeys = {
  all: (userId: number) =>
    [...privateKeys.user(userId), 'messages'] as const,
  conversations: (userId: number) =>
    [...messageKeys.all(userId), 'conversations'] as const,
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
};
