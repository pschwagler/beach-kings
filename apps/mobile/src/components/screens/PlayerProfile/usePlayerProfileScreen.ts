/**
 * Data hook for the Player Profile screen.
 *
 * Fetches a public player profile by ID, including their stats, mutual friends,
 * trophies, and leagues. Also manages the friend action state (add / pending / friends).
 */

import { useState, useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Player, FriendInLeague } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerLeague {
  readonly id: number;
  readonly name: string;
  readonly rank: number | null;
  readonly games_played: number;
}

export interface PlayerTrophy {
  readonly league_id: number;
  readonly league_name: string;
  readonly season_name: string;
  readonly place: number;
}

export interface PlayerProfileData {
  readonly player: Player;
  readonly mutualFriends: readonly FriendInLeague[];
  readonly leagues: readonly PlayerLeague[];
  readonly trophies: readonly PlayerTrophy[];
  /** 'none' | 'pending' | 'friends' */
  readonly friendStatus: 'none' | 'pending' | 'friends';
}

export interface UsePlayerProfileScreenResult {
  readonly profileData: PlayerProfileData | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isFriendActionLoading: boolean;
  readonly onRefresh: () => void;
  readonly isRefreshing: boolean;
  readonly onAddFriend: () => Promise<void>;
  readonly onMessage: () => void;
}

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const MOCK_LEAGUES: PlayerLeague[] = [
  { id: 1, name: 'QBK Open Men - Mornings', rank: 1, games_played: 47 },
  { id: 2, name: 'NYC Fun League', rank: 3, games_played: 12 },
];

const MOCK_TROPHIES: PlayerTrophy[] = [
  { league_id: 1, league_name: 'QBK Open Men - Mornings', season_name: 'Season 3', place: 2 },
  { league_id: 1, league_name: 'QBK Open Men - Mornings', season_name: 'Season 2', place: 2 },
];

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

      // Fetch player stats + mutual friends in parallel
      const [playerData, mutualFriendsData, batchStatus] = await Promise.all([
        api.getPlayerStats(numericId),
        api.getMutualFriends(numericId).catch(() => []),
        api.batchFriendStatus([numericId]).catch(() => ({})),
      ]);

      const rawStatus = (batchStatus as Record<string, string>)[String(numericId)] ?? 'none';
      const friendStatus: 'none' | 'pending' | 'friends' =
        rawStatus === 'friends' ? 'friends' :
        rawStatus === 'pending' ? 'pending' : 'none';

      // TODO(backend): GET /api/players/:id/trophies
      // TODO(backend): GET /api/players/:id/leagues
      return {
        player: playerData as Player,
        mutualFriends: mutualFriendsData as FriendInLeague[],
        leagues: MOCK_LEAGUES,
        trophies: MOCK_TROPHIES,
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

  return {
    profileData: profileData ?? null,
    isLoading,
    error,
    isFriendActionLoading,
    onRefresh,
    isRefreshing,
    onAddFriend,
    onMessage,
  };
}
