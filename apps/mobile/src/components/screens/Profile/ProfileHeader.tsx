/**
 * ProfileHeader — avatar, name, location/level meta, and friends count.
 * Matches the profile.html wireframe header section.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { ActivityIndicator, View, Pressable } from 'react-native';
import { type Player, formatLocation } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { CameraIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface ProfileHeaderProps {
  readonly player: Player | null;
  readonly isLoading: boolean;
  readonly friendCount: number | null;
  readonly friendCountError?: boolean;
  readonly onPhotoPress: () => void;
  readonly photoBusy?: boolean;
  readonly onFriendsPress: () => void;
  readonly onFriendCountRetry?: () => void;
}

export default function ProfileHeader({
  player,
  isLoading,
  friendCount,
  friendCountError = false,
  onPhotoPress,
  photoBusy = false,
  onFriendsPress,
  onFriendCountRetry,
}: ProfileHeaderProps): React.ReactNode {
  const palette = usePaletteColors();
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

  // The `city` column can already contain "City, State" (or a doubled state)
  // — formatLocation dedupes and omits when empty. See its util for details.
  const locationLabel = formatLocation(player?.city, player?.state);

  const hasMetaInfo = locationLabel != null || levelLabel != null;

  return (
    <View className="bg-surface items-center px-lg pt-xxl pb-xl">
      <Pressable
        onPress={onPhotoPress}
        disabled={photoBusy}
        accessibilityLabel="Manage profile photo"
        accessibilityRole="button"
        accessibilityState={{ disabled: photoBusy, busy: photoBusy }}
        className="relative"
      >
        <Avatar
          imageUrl={player?.profile_picture_url ?? null}
          name={fullName}
          size="xl"
          colorSeed={player?.id}
        />
        {photoBusy ? (
          <View className="absolute inset-0 rounded-full items-center justify-center overflow-hidden">
            <View
              className="absolute inset-0"
              style={{ backgroundColor: palette.bgNav, opacity: 0.7 }}
              accessible={false}
            />
            <ActivityIndicator color={palette.textInverse} />
          </View>
        ) : null}
        <View className="absolute -bottom-2 -right-3 w-11 h-11 rounded-full bg-nav border-2 border-surface items-center justify-center">
          <CameraIcon size={19} color={palette.textInverse} />
        </View>
      </Pressable>

      <AppText family="display" weight="bold" className="text-title2 text-default mt-md">
        {fullName}
      </AppText>

      {hasMetaInfo ? (
        <View className="flex-row items-center gap-xs mt-xs flex-wrap justify-center">
          {locationLabel != null && (
            <AppText className="text-sm text-muted">
              {locationLabel}
            </AppText>
          )}
          {locationLabel != null && levelLabel != null && (
            <AppText className="text-sm text-muted">
              {' · '}
            </AppText>
          )}
          {levelLabel != null && (
            <View className="bg-info-tint rounded-full px-sm py-0.5">
              <AppText className="text-xs font-semibold text-brand-teal">
                {levelLabel}
              </AppText>
            </View>
          )}
          {(locationLabel != null || levelLabel != null) && (
            <AppText className="text-sm text-muted">
              {' · '}
            </AppText>
          )}
          <Pressable
            onPress={friendCountError ? onFriendCountRetry : onFriendsPress}
            accessibilityRole="button"
            accessibilityLabel={
              friendCountError
                ? 'Retry loading friend count'
                : friendCount == null
                  ? 'Friends'
                  : `${friendCount} Friends`
            }
          >
            <AppText className="text-sm font-semibold text-brand-teal">
              {friendCountError
                ? friendCount == null
                  ? 'Friends unavailable · Retry'
                  : `${friendCount} Friends · Retry`
                : friendCount == null
                  ? 'Friends'
                  : `${friendCount} Friends`}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <AppText className="text-sm text-muted mt-xs italic">
          Add your details below
        </AppText>
      )}
    </View>
  );
}
