/**
 * ProfileHeader — avatar, name, location/level meta, and friends count.
 * Matches the profile.html wireframe header section.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Player } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

interface ProfileHeaderProps {
  readonly player: Player | null;
  readonly isLoading: boolean;
  readonly friendCount: number;
  readonly onEditPress: () => void;
  readonly onFriendsPress: () => void;
}

export default function ProfileHeader({
  player,
  isLoading,
  friendCount,
  onEditPress,
  onFriendsPress,
}: ProfileHeaderProps): React.ReactNode {
  if (isLoading) {
    return (
      <View
        className="bg-white dark:bg-dark-surface items-center px-lg pt-xl pb-lg"
        accessibilityLabel="Loading profile header"
      >
        <LoadingSkeleton width={88} height={88} borderRadius={44} />
        <View className="mt-md items-center gap-sm w-full">
          <LoadingSkeleton width={180} height={22} borderRadius={6} />
          <LoadingSkeleton width={140} height={16} borderRadius={4} />
        </View>
      </View>
    );
  }

  const fullName =
    player != null
      ? [player.first_name, player.last_name].filter(Boolean).join(' ') ||
        player.name ||
        'Player'
      : 'Player';

  const levelLabel =
    player?.level != null ? String(player.level) : null;

  const locationLabel =
    player?.city != null && player?.state != null
      ? `${player.city}, ${player.state}`
      : player?.city ?? player?.state ?? null;

  const hasMetaInfo = locationLabel != null || levelLabel != null;

  return (
    <View className="bg-white dark:bg-dark-surface items-center px-lg pt-xl pb-lg">
      <Pressable
        onPress={onEditPress}
        accessibilityLabel="Edit profile picture"
        accessibilityRole="button"
        className="relative"
      >
        <Avatar
          imageUrl={player?.profile_picture_url ?? null}
          name={fullName}
          size="xl"
        />
        <View className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-nav dark:bg-nav-dark border-2 border-white dark:border-dark-surface items-center justify-center">
          <Text className="text-white text-xs font-semibold">+</Text>
        </View>
      </Pressable>

      <Text className="text-xl font-bold text-text-default dark:text-content-primary mt-md">
        {fullName}
      </Text>

      {hasMetaInfo ? (
        <View className="flex-row items-center gap-xs mt-xs flex-wrap justify-center">
          {locationLabel != null && (
            <Text className="text-sm text-text-muted dark:text-text-tertiary">
              {locationLabel}
            </Text>
          )}
          {locationLabel != null && levelLabel != null && (
            <Text className="text-sm text-text-muted dark:text-text-tertiary">
              {' · '}
            </Text>
          )}
          {levelLabel != null && (
            <View className="bg-primary/10 dark:bg-brand-teal/20 rounded-full px-sm py-0.5">
              <Text className="text-xs font-semibold text-primary dark:text-brand-teal">
                {levelLabel}
              </Text>
            </View>
          )}
          {(locationLabel != null || levelLabel != null) && (
            <Text className="text-sm text-text-muted dark:text-text-tertiary">
              {' · '}
            </Text>
          )}
          <Pressable
            onPress={onFriendsPress}
            accessibilityRole="button"
            accessibilityLabel={`${friendCount} Friends`}
          >
            <Text className="text-sm font-semibold text-primary dark:text-brand-teal">
              {friendCount} Friends
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text className="text-sm text-text-muted dark:text-text-tertiary mt-xs italic">
          Add your details below
        </Text>
      )}
    </View>
  );
}
