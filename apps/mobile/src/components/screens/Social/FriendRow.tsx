/**
 * FriendRow — a single accepted-friend row in the Social hub's Friends tab.
 *
 * Renders the friend's avatar, name with an inline level badge, a
 * "league · city" meta line (league only when shared with the viewer), and a
 * right-aligned activity label ("Active today" in the success accent, "Nd ago"
 * muted; hidden entirely when the friend has no recent matches). Tapping opens
 * the player's profile.
 *
 * Wireframe ref: friends.html — .friend-item
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';
import { formatActivityLabel } from '@/lib/formatters';
import type { Friend } from '@beach-kings/shared';

interface FriendRowProps {
  readonly friend: Friend;
  readonly onPress: (playerId: number) => void;
  readonly onMessagePress: (playerId: number, fullName: string) => void;
}

export default function FriendRow({
  friend,
  onPress,
  onMessagePress,
}: FriendRowProps): React.ReactNode {
  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(friend.player_id);
  }, [onPress, friend.player_id]);

  const canMessage = friend.capability?.actions.direct_message ?? true;
  const handleMessagePress = useCallback(() => {
    void hapticLight();
    onMessagePress(friend.player_id, friend.full_name);
  }, [friend.full_name, friend.player_id, onMessagePress]);

  const activity = formatActivityLabel(friend.last_active);

  return (
    <View className="flex-row items-center gap-md px-lg py-md bg-surface border-b border-divider">
      <Pressable
        testID={`friend-row-${friend.player_id}`}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`View profile of ${friend.full_name}`}
        className="flex-1 min-w-0 flex-row items-center gap-md active:opacity-pressed"
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
          <AppText
            className="text-subhead font-semibold text-default shrink"
            numberOfLines={1}
          >
            {friend.full_name}
          </AppText>
          {friend.level != null && (
            <View className="bg-info-tint rounded-[8px] px-2 py-[2px] shrink-0">
              <AppText className="text-caption font-semibold text-info">
                {friend.level}
              </AppText>
            </View>
          )}
        </View>
        {(friend.shared_league_name != null || friend.location_name != null) && (
          <AppText
            className="text-caption text-muted mt-xxs"
            numberOfLines={1}
          >
            {[friend.shared_league_name, friend.location_name]
              .filter((part) => part != null)
              .join(' · ')}
          </AppText>
        )}
        </View>
        {activity != null && (
          <AppText
            className={
              activity.isRecent
                ? 'text-caption font-semibold text-success shrink-0'
                : 'text-caption text-muted shrink-0'
            }
          >
            {activity.label}
          </AppText>
        )}
      </Pressable>
      <Pressable
        testID={`friend-message-${friend.player_id}`}
        onPress={handleMessagePress}
        disabled={!canMessage}
        accessibilityRole="button"
        accessibilityLabel={`Message ${friend.full_name}`}
        accessibilityState={{ disabled: !canMessage }}
        className={`min-h-touch min-w-touch items-center justify-center rounded-full border border-brand px-sm active:opacity-pressed ${
          canMessage ? '' : 'opacity-disabled'
        }`}
      >
        <AppText className="text-caption font-semibold text-brand">
          Message
        </AppText>
      </Pressable>
    </View>
  );
}
