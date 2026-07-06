/**
 * Data hook for the Player Profile screen.
 *
 * Fetches a public player profile by ID, including their stats, mutual friends,
 * and leagues. Also manages the friend action state (add / pending / friends).
 */

import { useState, useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Player, FriendInLeague, PlayerLeague } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerProfileData {
  readonly player: Player;
  readonly mutualFriends: readonly FriendInLeague[];
  readonly leagues: readonly PlayerLeague[];
  /** 'none' | 'pending' | 'friends' */
  readonly friendStatus: 'none' | 'pending' | 'friends';
}

export interface UsePlayerProfileScreenResult {
  readonly profileData: PlayerProfileData | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  /**
   * True when the profile 404'd — by-design for players with no games
   * (backend hides them from /api/public/players), not a transient failure.
   */
  readonly isNotFound: boolean;
  readonly isFriendActionLoading: boolean;
  readonly onRefresh: () => void;
  readonly isRefreshing: boolean;
  readonly onAddFriend: () => Promise<void>;
  readonly onMessage: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches and manages state for viewing another player's profile.
 */
export function usePlayerProfileScreen(
  playerId: string | number,
  onNavigateToMessages: (id: number, name?: string) => void,
): UsePlayerProfileScreenResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: profileData, isLoading, error, refetch } = useApi<PlayerProfileData>(
    async () => {
      const numericId = typeof playerId === 'string' ? parseInt(playerId, 10) : playerId;

      // Fetch player profile, mutual friends, friend status, and leagues in parallel
      const [playerData, mutualFriendsData, batchStatus, leaguesData] = await Promise.all([
        api.getPublicPlayer(numericId),
        api.getMutualFriends(numericId).catch(() => []),
        api.batchFriendStatus([numericId]).catch(() => ({})),
        api.getPlayerLeagues(numericId).catch(() => []),
      ]);

      const rawStatus = (batchStatus as Record<string, string>)[String(numericId)] ?? 'none';
      const friendStatus: 'none' | 'pending' | 'friends' =
        rawStatus === 'friends' ? 'friends' :
        rawStatus === 'pending' ? 'pending' : 'none';

      return {
        player: playerData as Player,
        mutualFriends: mutualFriendsData as FriendInLeague[],
        leagues: leaguesData as PlayerLeague[],
        friendStatus,
      };
    },
    [playerId, refreshKey],
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => setIsRefreshing(false));
  }, [refetch]);

  const onAddFriend = useCallback(async () => {
    if (profileData == null) return;
    const numericId = typeof playerId === 'string' ? parseInt(playerId, 10) : playerId;
    setIsFriendActionLoading(true);
    try {
      await api.sendFriendRequest(numericId);
      // Refresh to update friend status
      setRefreshKey((k) => k + 1);
    } finally {
      setIsFriendActionLoading(false);
    }
  }, [playerId, profileData]);

  const onMessage = useCallback(() => {
    const numericId = typeof playerId === 'string' ? parseInt(playerId, 10) : playerId;
    const player = profileData?.player;
    const name = player != null
      ? [player.first_name, player.last_name].filter(Boolean).join(' ') || player.name || undefined
      : undefined;
    onNavigateToMessages(numericId, name);
  }, [playerId, profileData, onNavigateToMessages]);

  const isNotFound =
    (error as { response?: { status?: number } } | null)?.response?.status === 404;

  return {
    profileData: profileData ?? null,
    isLoading,
    error,
    isNotFound,
    isFriendActionLoading,
    onRefresh,
    isRefreshing,
    onAddFriend,
    onMessage,
  };
}
