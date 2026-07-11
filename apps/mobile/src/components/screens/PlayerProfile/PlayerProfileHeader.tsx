/**
 * Profile header section for the Player Profile screen.
 * Shows avatar, name, location, level badge, and Add Friend / Message buttons.
 * For guest players (is_placeholder), renders a "not on Beach League yet" banner
 * and a Send Invite button instead of the social actions.
 */

import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import type { Player } from '@beach-kings/shared';

interface PlayerProfileHeaderProps {
  readonly player: Player;
  readonly friendStatus: 'none' | 'pending' | 'friends';
  readonly isFriendActionLoading: boolean;
  readonly onAddFriend: () => void;
  readonly onMessage: () => void;
  readonly onSendInvite?: () => void;
}

export default function PlayerProfileHeader({
  player,
  friendStatus,
  isFriendActionLoading,
  onAddFriend,
  onMessage,
  onSendInvite,
}: PlayerProfileHeaderProps): React.ReactNode {
  const displayName = [player.first_name, player.last_name]
    .filter(Boolean)
    .join(' ') || player.name || 'Unknown Player';

  const location = [player.city, player.state]
    .filter(Boolean)
    .join(', ');

  // Treat an empty/whitespace level string as absent so we never render a
  // dangling separator next to an empty badge.
  const rawLevel = player.level ?? null;
  const level =
    typeof rawLevel === 'string' && rawLevel.trim().length === 0
      ? null
      : rawLevel;
  const isGuest = player.is_placeholder === true;

  return (
    <View
      testID="player-profile-header"
      className="bg-elevated px-lg pt-xl pb-lg items-center border-b border-strong"
    >
      <Avatar
        name={displayName}
        imageUrl={player.profile_picture_url}
        size="xl"
        colorSeed={player.id}
        className={`mb-sm ${
          isGuest
            ? 'border-2 border-dashed border-brand-gold'
            : 'border-2 border-brand-teal/20'
        }`}
      />

      {/* Name */}
      <Text
        testID="player-profile-name"
        className="text-[22px] font-bold text-default"
      >
        {displayName}
      </Text>

      {/* Guest badge */}
      {isGuest && (
        <View className="bg-brand-gold/15 px-sm py-[3px] rounded-xl mt-xs">
          <Text className="text-xs font-semibold text-brand-gold">Guest</Text>
        </View>
      )}

      {/* Meta row: location + level badge */}
      <View className="flex-row items-center gap-sm mt-xs">
        {location.length > 0 && (
          <Text className="text-sm text-muted">
            {location}
          </Text>
        )}
        {location.length > 0 && level != null && (
          <Text className="text-muted">·</Text>
        )}
        {level != null && (
          <View className="bg-brand-teal/10 px-sm py-[3px] rounded-xl">
            <Text className="text-xs font-semibold text-brand-teal">{level}</Text>
          </View>
        )}
      </View>

      {/* Guest banner */}
      {isGuest && (
        <View
          testID="guest-not-joined-banner"
          className="mt-md px-md py-sm rounded-xl bg-brand-gold/10 border border-brand-gold/30 items-center"
        >
          <Text className="text-sm text-brand-gold text-center">
            This player hasn't joined Beach League yet.
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View className="flex-row gap-sm mt-md">
        {isGuest ? (
          <Pressable
            testID="player-send-invite-btn"
            onPress={onSendInvite}
            accessibilityRole="button"
            accessibilityLabel={`Invite ${displayName} to Beach League`}
            className="px-xl py-sm rounded-xl bg-brand-gold min-h-touch items-center justify-center active:opacity-70"
          >
            <Text className="text-sm font-semibold text-white">Send Invite</Text>
          </Pressable>
        ) : (
          <>
            <FriendButton
              friendStatus={friendStatus}
              isLoading={isFriendActionLoading}
              onPress={onAddFriend}
            />
            <Pressable
              testID="player-message-btn"
              onPress={onMessage}
              accessibilityRole="button"
              accessibilityLabel={`Send message to ${displayName}`}
              className="px-xl py-sm rounded-xl border-[1.5px] border-default min-h-touch items-center justify-center active:opacity-70"
            >
              <Text className="text-sm font-semibold text-default">
                Message
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Friend button — changes label based on status
// ---------------------------------------------------------------------------

interface FriendButtonProps {
  readonly friendStatus: 'none' | 'pending' | 'friends';
  readonly isLoading: boolean;
  readonly onPress: () => void;
}

function FriendButton({
  friendStatus,
  isLoading,
  onPress,
}: FriendButtonProps): React.ReactNode {
  const isPending = friendStatus === 'pending';
  const isFriends = friendStatus === 'friends';
  const isDisabled = isPending || isFriends || isLoading;

  const label = isFriends ? 'Friends' : isPending ? 'Request Sent' : 'Add Friend';

  return (
    <Pressable
      testID="player-add-friend-btn"
      onPress={isDisabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      className={`px-xl py-sm rounded-xl min-h-touch items-center justify-center active:opacity-70 ${
        isFriends || isPending
          ? 'bg-default/20'
          : 'bg-default'
      }`}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text
          className={`text-sm font-semibold ${
            isFriends || isPending
              ? 'text-default'
              : 'text-inverse'
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
