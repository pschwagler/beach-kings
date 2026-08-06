import { privateKeys } from '@/infrastructure/query/keys';

export const notificationKeys = {
  all: (userId: number) =>
    [...privateKeys.user(userId), 'notifications'] as const,
  feed: (userId: number) =>
    [...notificationKeys.all(userId), 'feed'] as const,
  unreadCount: (userId: number) =>
    [...notificationKeys.all(userId), 'unread-count'] as const,
  preferences: (userId: number) =>
    [...notificationKeys.all(userId), 'push-preferences'] as const,
};
