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
        className="bg-surface items-center px-lg pt-xxl pb-xl"
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
    <View className="bg-surface items-center px-lg pt-xxl pb-xl">
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
        <View className="absolute -bottom-2 -right-3 w-11 h-11 rounded-full bg-nav border-2 border-surface items-center justify-center">
          <Text className="text-white text-xs font-semibold">+</Text>
        </View>
      </Pressable>

      <Text className="text-title2 font-bold text-default mt-md">
        {fullName}
      </Text>

      {hasMetaInfo ? (
        <View className="flex-row items-center gap-xs mt-xs flex-wrap justify-center">
          {locationLabel != null && (
            <Text className="text-sm text-muted">
              {locationLabel}
            </Text>
          )}
          {locationLabel != null && levelLabel != null && (
            <Text className="text-sm text-muted">
              {' · '}
            </Text>
          )}
          {levelLabel != null && (
            <View className="bg-brand-teal/10 rounded-full px-sm py-0.5">
              <Text className="text-xs font-semibold text-brand-teal">
                {levelLabel}
              </Text>
            </View>
          )}
          {(locationLabel != null || levelLabel != null) && (
            <Text className="text-sm text-muted">
              {' · '}
            </Text>
          )}
          <Pressable
            onPress={onFriendsPress}
            accessibilityRole="button"
            accessibilityLabel={`${friendCount} Friends`}
          >
            <Text className="text-sm font-semibold text-brand-teal">
              {friendCount} Friends
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text className="text-sm text-muted mt-xs italic">
          Add your details below
        </Text>
      )}
    </View>
  );
}
