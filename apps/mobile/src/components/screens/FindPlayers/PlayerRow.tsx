/**
 * PlayerRow — a single player card in the Find Players list.
 *
 * Wireframe ref: find-players.html — .player-item
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { pluralize } from '@/lib/formatters';
import { presentRelationship } from '@/features/social';
import type { FriendshipStatus } from '@beach-kings/shared';

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
  readonly friend_status: FriendshipStatus;
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

  const friendStatus: FriendshipStatus = isPendingSend
    ? 'pending_outgoing'
    : player.friend_status;
  const relationship = presentRelationship(friendStatus);

  return (
    <Pressable
      testID={`player-row-${player.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`View profile of ${player.full_name}`}
      className="flex-row items-center gap-3 px-4 py-[14px] bg-surface border-b border-divider active:opacity-70"
    >
      <Avatar
        imageUrl={player.avatar}
        name={player.full_name}
        size="md"
        colorSeed={player.player_id}
        accessible={false}
      />

      {/* Info */}
      <View className="flex-1 min-w-0">
        <AppText className="text-[14px] font-semibold text-default" numberOfLines={1}>
          {player.full_name}
        </AppText>
        {player.city != null && (
          <AppText className="text-[12px] text-muted mt-[2px]" numberOfLines={1}>
            {player.city}
          </AppText>
        )}
        <View className="flex-row gap-[6px] mt-1 flex-wrap">
          {player.level != null && (
            <View className="bg-info-tint rounded-[8px] px-2 py-[2px]">
              <AppText className="text-[10px] font-bold text-info">
                {player.level}
              </AppText>
            </View>
          )}
          {player.mutual_friends_count > 0 && (
            <View className="bg-elevated rounded-[8px] px-2 py-[2px]">
              <AppText className="text-[10px] font-bold text-muted">
                {player.mutual_friends_count} mutual
              </AppText>
            </View>
          )}
        </View>
        {(player.games_played > 0 || player.last_active_label != null) && (
          <AppText className="text-[11px] text-tertiary mt-1">
            {player.games_played > 0 ? pluralize(player.games_played, 'game') : ''}
            {player.games_played > 0 && player.last_active_label != null
              ? ' · '
              : ''}
            {player.last_active_label ?? ''}
          </AppText>
        )}
      </View>

      {/* Relationship status stays compact; incoming actions live on profile. */}
      {relationship.canAdd && (
        <Pressable
          testID={`add-friend-btn-${player.player_id}`}
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel={`Add ${player.full_name} as friend`}
          className="px-[14px] py-[10px] rounded-[8px] border border-brand-teal bg-transparent min-h-[44px] justify-center active:opacity-70"
        >
          <AppText className="text-[12px] font-bold text-brand-teal">
            Add
          </AppText>
        </Pressable>
      )}
      {!relationship.canAdd && relationship.discoveryLabel != null && (
        <View
          testID={`relationship-status-${player.player_id}`}
          className="px-[14px] py-[10px] rounded-[8px] bg-info-tint min-h-[44px] justify-center"
        >
          <AppText className="text-[12px] font-bold text-info">
            {relationship.discoveryLabel}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}
