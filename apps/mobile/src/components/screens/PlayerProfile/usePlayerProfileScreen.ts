/** Cached data and shared relationship actions for the public player profile. */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FriendshipStatus, MutualFriend, Player, PlayerLeague } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendshipMutations, socialQueries } from '@/features/social';
import { usePlayerRelationshipQuery } from '@/features/social/usePlayerRelationshipQuery';

export interface PlayerProfileData {
  readonly player: Player;
  readonly mutualFriends: readonly MutualFriend[];
  readonly leagues: readonly PlayerLeague[];
  readonly friendStatus: FriendshipStatus;
}

export interface UsePlayerProfileScreenResult {
  readonly profileData: PlayerProfileData | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isNotFound: boolean;
  readonly isFriendActionLoading: boolean;
  readonly onRefresh: () => void;
  readonly isRefreshing: boolean;
  readonly onAddFriend: () => Promise<void>;
  readonly onAcceptFriend: () => Promise<void>;
  readonly onDeclineFriend: () => Promise<void>;
  readonly onMessage: () => void;
}

export function usePlayerProfileScreen(
  playerId: string | number,
  onNavigateToMessages: (id: number, name?: string) => void,
): UsePlayerProfileScreenResult {
  const numericId = typeof playerId === 'string' ? parseInt(playerId, 10) : playerId;
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  const relationshipQuery = usePlayerRelationshipQuery(numericId);
  const friendship = useFriendshipMutations();

  const profileQuery = useQuery(
    socialQueries.profile(userId, numericId, isAuthenticated),
  );

  const onRefresh = useCallback(() => {
    void Promise.all([profileQuery.refetch(), relationshipQuery.refetch()]);
  }, [profileQuery, relationshipQuery]);

  const onAddFriend = useCallback(async () => {
    await friendship.send.mutateAsync(numericId);
  }, [friendship.send, numericId]);

  const onAcceptFriend = useCallback(async () => {
    const requestId = relationshipQuery.data?.request_id;
    if (requestId == null) return;
    await friendship.accept.mutateAsync({ requestId, playerId: numericId });
  }, [friendship.accept, numericId, relationshipQuery.data?.request_id]);

  const onDeclineFriend = useCallback(async () => {
    const requestId = relationshipQuery.data?.request_id;
    if (requestId == null) return;
    await friendship.decline.mutateAsync({ requestId, playerId: numericId });
  }, [friendship.decline, numericId, relationshipQuery.data?.request_id]);

  const onMessage = useCallback(() => {
    const player = profileQuery.data?.player;
    const name = player != null
      ? [player.first_name, player.last_name].filter(Boolean).join(' ') ||
        player.name || undefined
      : undefined;
    onNavigateToMessages(numericId, name);
  }, [numericId, onNavigateToMessages, profileQuery.data?.player]);

  const error = (profileQuery.error ?? relationshipQuery.error) as Error | null;
  const isNotFound =
    (profileQuery.error as { response?: { status?: number } } | null)?.response
      ?.status === 404;
  const details = profileQuery.data;
  const profileData: PlayerProfileData | null = details == null
    ? null
    : {
        ...details,
        friendStatus: relationshipQuery.data?.status ?? 'none',
      };

  return {
    profileData,
    isLoading: profileQuery.isLoading || relationshipQuery.isLoading,
    error,
    isNotFound,
    isFriendActionLoading:
      friendship.send.isPending ||
      friendship.accept.isPending ||
      friendship.decline.isPending,
    onRefresh,
    isRefreshing: profileQuery.isRefetching || relationshipQuery.isRefetching,
    onAddFriend,
    onAcceptFriend,
    onDeclineFriend,
    onMessage,
  };
}
