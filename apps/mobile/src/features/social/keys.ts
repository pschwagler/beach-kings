import type { DiscoverFilters, FriendRequestDirection } from '@beach-kings/shared';
import { privateKeys } from '@/infrastructure/query/keys';

export type AuthenticatedUserId = number;

export const socialKeys = {
  all: (userId: AuthenticatedUserId) =>
    [...privateKeys.user(userId), 'social'] as const,
  friends: (userId: AuthenticatedUserId) =>
    [...socialKeys.all(userId), 'friends'] as const,
  requestsRoot: (userId: AuthenticatedUserId) =>
    [...socialKeys.all(userId), 'requests'] as const,
  requests: (
    userId: AuthenticatedUserId,
    direction: FriendRequestDirection = 'both',
  ) => [...socialKeys.requestsRoot(userId), direction] as const,
  suggestions: (userId: AuthenticatedUserId) =>
    [...socialKeys.all(userId), 'suggestions'] as const,
  discoveryRoot: (userId: AuthenticatedUserId) =>
    [...socialKeys.all(userId), 'discovery'] as const,
  discovery: (userId: AuthenticatedUserId, filters: DiscoverFilters) =>
    [...socialKeys.discoveryRoot(userId), filters] as const,
  profile: (userId: AuthenticatedUserId, playerId: number) =>
    [...socialKeys.all(userId), 'profile', playerId] as const,
  relationship: (userId: AuthenticatedUserId, playerId: number) =>
    [...socialKeys.all(userId), 'relationship', playerId] as const,
};

export const socialMutationKeys = {
  send: (userId: AuthenticatedUserId) =>
    [...socialKeys.all(userId), 'send-request'] as const,
  accept: (userId: AuthenticatedUserId) =>
    [...socialKeys.all(userId), 'accept-request'] as const,
  decline: (userId: AuthenticatedUserId) =>
    [...socialKeys.all(userId), 'decline-request'] as const,
  cancel: (userId: AuthenticatedUserId) =>
    [...socialKeys.all(userId), 'cancel-request'] as const,
};
