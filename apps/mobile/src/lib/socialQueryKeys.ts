import type { FriendRequestDirection } from '@beach-kings/shared';

export type AuthenticatedUserId = number;

export interface DiscoverFilters {
  readonly level?: string;
  readonly same_league?: true;
  readonly has_mutuals?: true;
}

/**
 * Query keys for private social data. The authenticated user id is part of
 * every key so data from one account can never satisfy another account's
 * request, even briefly during an account switch.
 */
export const socialQueryKeys = {
  all: (userId: AuthenticatedUserId) => ['social', userId] as const,
  friends: (userId: AuthenticatedUserId) =>
    [...socialQueryKeys.all(userId), 'friends'] as const,
  requests: (
    userId: AuthenticatedUserId,
    direction: FriendRequestDirection = 'both',
  ) => [...socialQueryKeys.all(userId), 'requests', direction] as const,
  suggestions: (userId: AuthenticatedUserId) =>
    [...socialQueryKeys.all(userId), 'suggestions'] as const,
  discovery: (userId: AuthenticatedUserId, filters: DiscoverFilters) =>
    [...socialQueryKeys.all(userId), 'discovery', filters] as const,
  profile: (userId: AuthenticatedUserId, playerId: number) =>
    [...socialQueryKeys.all(userId), 'profile', playerId] as const,
  relationship: (userId: AuthenticatedUserId, playerId: number) =>
    [...socialQueryKeys.all(userId), 'relationship', playerId] as const,
};

export const notificationQueryKeys = {
  all: (userId: AuthenticatedUserId) => ['notifications', userId] as const,
  feed: (userId: AuthenticatedUserId) =>
    [...notificationQueryKeys.all(userId), 'feed'] as const,
  unreadCount: (userId: AuthenticatedUserId) =>
    [...notificationQueryKeys.all(userId), 'unread-count'] as const,
};

export const socialMutationKeys = {
  send: (userId: AuthenticatedUserId) =>
    [...socialQueryKeys.all(userId), 'send-request'] as const,
  accept: (userId: AuthenticatedUserId) =>
    [...socialQueryKeys.all(userId), 'accept-request'] as const,
  decline: (userId: AuthenticatedUserId) =>
    [...socialQueryKeys.all(userId), 'decline-request'] as const,
  cancel: (userId: AuthenticatedUserId) =>
    [...socialQueryKeys.all(userId), 'cancel-request'] as const,
};
