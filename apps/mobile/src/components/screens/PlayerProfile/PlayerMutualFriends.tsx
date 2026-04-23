/**
 * Mutual friends section for the Player Profile screen.
 * Shows a horizontal scroll of mutual friend avatars with names.
 */

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { FriendInLeague } from '@beach-kings/shared';

interface PlayerMutualFriendsProps {
  readonly mutualFriends: readonly FriendInLeague[];
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
      className="bg-white dark:bg-elevated px-lg py-md border-b border-border dark:border-border-strong"
    >
      <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-md">
        {label}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-lg">
          {mutualFriends.map((friend) => {
            const name = friend.first_name ?? '';
            const initial = name.trim().charAt(0).toUpperCase() || '?';

            return (
              <View
                key={friend.player_id}
                testID={`mutual-friend-${friend.player_id}`}
                className="items-center gap-xs"
              >
                <View className="w-[44px] h-[44px] rounded-full bg-neutral-200 dark:bg-elevated-2 items-center justify-center">
                  <Text className="text-sm font-bold text-text-muted dark:text-text-tertiary">
                    {initial}
                  </Text>
                </View>
                <Text className="text-[11px] text-text-muted dark:text-text-tertiary max-w-[60px] text-center">
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
