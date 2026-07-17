/**
 * Mutual friends section for the Player Profile screen.
 * Shows a horizontal scroll of mutual friend avatars with names.
 */

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { MutualFriend } from '@beach-kings/shared';

interface PlayerMutualFriendsProps {
  readonly mutualFriends: readonly MutualFriend[];
}

export default function PlayerMutualFriends({
  mutualFriends,
}: PlayerMutualFriendsProps): React.ReactNode {
  if (mutualFriends.length === 0) return null;

  const count = mutualFriends.length;
  const label = count === 1 ? '1 Mutual Friend' : `${count} Mutual Friends`;

  return (
    <View
      testID="player-mutual-friends"
      className="bg-elevated px-lg py-md border-b border-strong"
    >
      <Text className="text-[15px] font-bold text-default mb-md">
        {label}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-lg">
          {mutualFriends.map((friend) => {
            const name = friend.full_name.trim();
            const initial = name.charAt(0).toUpperCase();

            return (
              <View
                key={friend.player_id}
                testID={`mutual-friend-${friend.player_id}`}
                className="items-center gap-xs"
              >
                <View className="w-[44px] h-[44px] rounded-full bg-page items-center justify-center">
                  <Text className="text-sm font-bold text-muted">
                    {initial}
                  </Text>
                </View>
                <Text className="text-[11px] text-muted max-w-[60px] text-center">
                  {name.trim()}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
