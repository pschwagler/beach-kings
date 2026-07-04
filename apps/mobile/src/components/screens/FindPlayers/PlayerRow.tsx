/**
 * PlayerRow — a single player card in the Find Players list.
 *
 * Wireframe ref: find-players.html — .player-item
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { pluralize } from '@/lib/formatters';

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
      className="flex-row items-center gap-3 px-4 py-[14px] bg-surface border-b border-divider active:opacity-70"
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-elevated items-center justify-center flex-shrink-0">
        <Text className="text-muted font-bold text-base">
          {getInitials(player.full_name)}
        </Text>
      </View>

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text className="text-[14px] font-semibold text-default" numberOfLines={1}>
          {player.full_name}
        </Text>
        {player.city != null && (
          <Text className="text-[12px] text-muted mt-[2px]" numberOfLines={1}>
            {player.city}
          </Text>
        )}
        <View className="flex-row gap-[6px] mt-1 flex-wrap">
          {player.level != null && (
            <View className="bg-info-tint rounded-[8px] px-2 py-[2px]">
              <Text className="text-[10px] font-bold text-info">
                {player.level}
              </Text>
            </View>
          )}
          {player.mutual_friends_count > 0 && (
            <View className="bg-elevated rounded-[8px] px-2 py-[2px]">
              <Text className="text-[10px] font-bold text-muted">
                {player.mutual_friends_count} mutual
              </Text>
            </View>
          )}
        </View>
        {(player.games_played > 0 || player.last_active_label != null) && (
          <Text className="text-[11px] text-tertiary mt-1">
            {player.games_played > 0 ? pluralize(player.games_played, 'game') : ''}
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
          className="px-[14px] py-[10px] rounded-[8px] border border-brand-teal bg-transparent min-h-[44px] justify-center active:opacity-70"
        >
          <Text className="text-[12px] font-bold text-brand-teal">
            Add
          </Text>
        </Pressable>
      )}
      {(friendStatus === 'pending') && (
        <View
          testID={`pending-btn-${player.player_id}`}
          className="px-[14px] py-[10px] rounded-[8px] bg-info-tint min-h-[44px] justify-center"
        >
          <Text className="text-[12px] font-bold text-info">
            Pending
          </Text>
        </View>
      )}
      {friendStatus === 'friend' && (
        <View
          testID={`friends-badge-${player.player_id}`}
          className="px-[14px] py-[10px] rounded-[8px] bg-info-tint min-h-[44px] justify-center"
        >
          <Text className="text-[12px] font-bold text-info">
            Friends
          </Text>
        </View>
      )}
    </Pressable>
  );
}
