/**
 * FriendRow — a single accepted-friend row in the Social hub's Friends tab.
 *
 * Renders the friend's avatar, name with an inline level badge, and a location
 * meta line. Tapping opens the player's profile. The wireframe's "Active today"
 * activity label and league name are backend-only fields we don't have yet, so
 * they're omitted gracefully (tracked in the parity plan's Backlog epic).
 *
 * Wireframe ref: friends.html — .friend-item
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';
import type { Friend } from '@beach-kings/shared';

interface FriendRowProps {
  readonly friend: Friend;
  readonly onPress: (playerId: number) => void;
}

export default function FriendRow({
  friend,
  onPress,
}: FriendRowProps): React.ReactNode {
  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(friend.player_id);
  }, [onPress, friend.player_id]);

  return (
    <Pressable
      testID={`friend-row-${friend.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`View profile of ${friend.full_name}`}
      className="flex-row items-center gap-3 px-4 py-3 bg-surface border-b border-divider active:opacity-70"
    >
      <Avatar
        imageUrl={friend.avatar}
        name={friend.full_name}
        size="md"
        colorSeed={friend.player_id}
        accessible={false}
      />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-[6px]">
          <Text
            className="text-[14px] font-semibold text-default shrink"
            numberOfLines={1}
          >
            {friend.full_name}
          </Text>
          {friend.level != null && (
            <View className="bg-info-tint rounded-[8px] px-2 py-[2px] shrink-0">
              <Text className="text-[10px] font-bold text-info">
                {friend.level}
              </Text>
            </View>
          )}
        </View>
        {(friend.shared_league_name != null || friend.location_name != null) && (
          <Text
            className="text-[12px] text-muted mt-[2px]"
            numberOfLines={1}
          >
            {[friend.shared_league_name, friend.location_name]
              .filter((part) => part != null)
              .join(' · ')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
