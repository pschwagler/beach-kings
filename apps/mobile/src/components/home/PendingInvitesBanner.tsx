/**
 * Amber-accent banner prompting the user to send invites to pending players.
 * Mirrors `home.html` `.pending-invites-banner`.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { UsersIcon, XIcon } from '@/components/ui/icons';

interface PendingInvitesBannerProps {
  readonly playerCount: number;
  readonly gameCount: number;
  readonly onPress: () => void;
  readonly onDismiss?: () => void;
}

export default function PendingInvitesBanner({
  playerCount,
  gameCount,
  onPress,
  onDismiss,
}: PendingInvitesBannerProps): React.ReactNode {
  return (
    <View className="flex-row items-center gap-sm bg-[#fffbeb] dark:bg-warning-bg border border-warning rounded-[10px] px-md py-sm mb-md">
      <UsersIcon size={16} color="#92400e" />
      <View className="flex-1">
        <Text className="text-footnote font-medium text-[#92400e] dark:text-warning-text">
          <Text className="font-bold">
            {playerCount} {playerCount === 1 ? 'player' : 'players'} waiting
          </Text>{' '}
          · {gameCount} {gameCount === 1 ? 'game' : 'games'} pending
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Send invites"
        className="bg-warning rounded-lg px-md py-xxs min-h-[32px] items-center justify-center"
      >
        <Text className="text-white font-bold text-caption">Send Invites</Text>
      </Pressable>
      {onDismiss != null && (
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="Dismiss pending invites banner"
          accessibilityRole="button"
          className="w-[28px] h-[28px] items-center justify-center"
          hitSlop={6}
        >
          <XIcon size={14} color="#b45309" />
        </Pressable>
      )}
    </View>
  );
}
