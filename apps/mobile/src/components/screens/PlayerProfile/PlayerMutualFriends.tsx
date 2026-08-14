/**
 * Mutual friends section for the Player Profile screen.
 * Shows a horizontal scroll of mutual friend avatars with names.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, ScrollView } from 'react-native';
import Avatar from '@/components/ui/Avatar';
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
      <AppText className="text-[15px] font-bold text-default mb-md">
        {label}
      </AppText>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-lg">
          {mutualFriends.map((friend) => {
            const name = friend.full_name.trim() || `Player ${friend.player_id}`;

            return (
              <View
                key={friend.player_id}
                testID={`mutual-friend-${friend.player_id}`}
                className="items-center gap-xs"
              >
                <Avatar
                  imageUrl={friend.avatar}
                  name={name}
                  size="md"
                  colorSeed={friend.player_id}
                />
                <AppText className="text-[11px] text-muted max-w-[60px] text-center">
                  {name}
                </AppText>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
