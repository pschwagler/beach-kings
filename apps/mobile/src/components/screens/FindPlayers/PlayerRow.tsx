/**
 * PlayerRow — a single player card in the Find Players list.
 *
 * Wireframe ref: find-players.html — .player-item
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { hapticLight, hapticMedium } from '@/utils/haptics';

/** Shape of a discoverable player returned by the discover endpoint. */
export interface DiscoverPlayer {
  readonly player_id: number;
  readonly full_name: string;
  readonly avatar: string | null;
  readonly city: string | null;
  readonly level: string | null;
  readonly games_played: number;
  readonly mutual_friends_count: number;
  readonly last_active_label: string | null;
  /** 'none' | 'pending' | 'friend' */
  readonly friend_status: 'none' | 'pending' | 'friend';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface PlayerRowProps {
  readonly player: DiscoverPlayer;
  readonly onPress: (playerId: number) => void;
  readonly onAddFriend: (playerId: number) => void;
  /** Tracks optimistic pending state for this player. */
  readonly isPendingSend: boolean;
}

export default function PlayerRow({
  player,
  onPress,
  onAddFriend,
  isPendingSend,
}: PlayerRowProps): React.ReactNode {
  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(player.player_id);
  }, [onPress, player.player_id]);

  const handleAdd = useCallback(() => {
    void hapticMedium();
    onAddFriend(player.player_id);
  }, [onAddFriend, player.player_id]);

  const friendStatus = isPendingSend ? 'pending' : player.friend_status;

  return (
    <Pressable
      testID={`player-row-${player.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`View profile of ${player.full_name}`}
      className="flex-row items-center gap-3 px-4 py-[14px] bg-white dark:bg-dark-surface border-b border-[#f0f0f0] dark:border-border-strong active:opacity-70"
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-[#ddd] dark:bg-dark-elevated items-center justify-center flex-shrink-0">
        <Text className="text-[#666] dark:text-content-secondary font-bold text-base">
          {getInitials(player.full_name)}
        </Text>
      </View>

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary" numberOfLines={1}>
          {player.full_name}
        </Text>
        {player.city != null && (
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]" numberOfLines={1}>
            {player.city}
          </Text>
        )}
        <View className="flex-row gap-[6px] mt-1 flex-wrap">
          {player.level != null && (
            <View className="bg-[#e8f4f8] dark:bg-teal-900 rounded-[8px] px-2 py-[2px]">
              <Text className="text-[10px] font-bold text-[#2a7d9c] dark:text-teal-300">
                {player.level}
              </Text>
            </View>
          )}
          {player.mutual_friends_count > 0 && (
            <View className="bg-[#f0f0f0] dark:bg-dark-elevated rounded-[8px] px-2 py-[2px]">
              <Text className="text-[10px] font-bold text-[#666] dark:text-content-secondary">
                {player.mutual_friends_count} mutual
              </Text>
            </View>
          )}
        </View>
        {(player.games_played > 0 || player.last_active_label != null) && (
          <Text className="text-[11px] text-[#999] dark:text-content-tertiary mt-1">
            {player.games_played > 0 ? `${player.games_played} games` : ''}
            {player.games_played > 0 && player.last_active_label != null
              ? ' · '
              : ''}
            {player.last_active_label ?? ''}
          </Text>
        )}
      </View>

      {/* Add / Pending / Friend button */}
      {friendStatus === 'none' && (
        <Pressable
          testID={`add-friend-btn-${player.player_id}`}
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel={`Add ${player.full_name} as friend`}
          className="px-[14px] py-[10px] rounded-[8px] border border-[#1a3a4a] dark:border-brand-teal bg-transparent min-h-[44px] justify-center active:opacity-70"
        >
          <Text className="text-[12px] font-bold text-[#1a3a4a] dark:text-brand-teal">
            Add
          </Text>
        </Pressable>
      )}
      {(friendStatus === 'pending') && (
        <View
          testID={`pending-btn-${player.player_id}`}
          className="px-[14px] py-[10px] rounded-[8px] bg-[#e8f4f8] dark:bg-teal-900 min-h-[44px] justify-center"
        >
          <Text className="text-[12px] font-bold text-[#2a7d9c] dark:text-teal-300">
            Pending
          </Text>
        </View>
      )}
      {friendStatus === 'friend' && (
        <View
          testID={`friends-badge-${player.player_id}`}
          className="px-[14px] py-[10px] rounded-[8px] bg-[#e8f4f8] dark:bg-teal-900 min-h-[44px] justify-center"
        >
          <Text className="text-[12px] font-bold text-[#2a7d9c] dark:text-teal-300">
            Friends
          </Text>
        </View>
      )}
    </Pressable>
  );
}
