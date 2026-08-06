/**
 * Profile header section for the Player Profile screen.
 * Shows avatar, name, location, level badge, and Add Friend / Message buttons.
 * For guest players (is_placeholder), renders a "not on Beach League yet" banner
 * and an Invite to App button instead of the social actions.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable, ActivityIndicator } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { presentRelationship } from '@/features/social';
import { usePaletteColors } from '@/theme/usePaletteColors';
import type { FriendshipStatus, Player } from '@beach-kings/shared';

interface PlayerProfileHeaderProps {
  readonly player: Player;
  readonly friendStatus: FriendshipStatus;
  readonly isFriendActionLoading: boolean;
  readonly onAddFriend: () => void;
  readonly onAcceptFriend: () => void;
  readonly onDeclineFriend: () => void;
  readonly onMessage: () => void;
  readonly onSendInvite?: () => void;
  readonly interactionAvailable?: boolean;
  readonly blockedByViewer?: boolean;
  readonly safetyPending?: boolean;
  readonly onUnblock?: () => void;
}

export default function PlayerProfileHeader({
  player,
  friendStatus,
  isFriendActionLoading,
  onAddFriend,
  onAcceptFriend,
  onDeclineFriend,
  onMessage,
  onSendInvite,
  interactionAvailable = true,
  blockedByViewer = false,
  safetyPending = false,
  onUnblock,
}: PlayerProfileHeaderProps): React.ReactNode {
  const palette = usePaletteColors();
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
  const relationship = presentRelationship(friendStatus);

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
            : 'border-2 border-divider'
        }`}
      />

      {/* Name */}
      <AppText
        testID="player-profile-name"
        family="display"
        weight="bold"
        className="text-[22px] text-default"
      >
        {displayName}
      </AppText>

      {/* Guest badge */}
      {isGuest && (
        <View className="bg-warning-tint px-sm py-[3px] rounded-xl mt-xs">
          <AppText className="text-xs font-semibold text-accent">Guest</AppText>
        </View>
      )}

      {/* Meta row: location + level badge */}
      <View className="flex-row items-center gap-sm mt-xs">
        {location.length > 0 && (
          <AppText className="text-sm text-muted">
            {location}
          </AppText>
        )}
        {location.length > 0 && level != null && (
          <AppText className="text-muted">·</AppText>
        )}
        {level != null && (
          <View className="bg-info-tint px-sm py-[3px] rounded-xl">
            <AppText className="text-xs font-semibold text-brand-teal">{level}</AppText>
          </View>
        )}
      </View>

      {/* Guest banner */}
      {isGuest && (
        <View
          testID="guest-not-joined-banner"
          className="mt-md px-md py-sm rounded-xl bg-warning-tint border border-warning items-center"
        >
          <AppText className="text-sm text-accent text-center">
            This player hasn't joined Beach League yet.
          </AppText>
        </View>
      )}

      {/* Action buttons */}
      <View className="flex-row gap-sm mt-md">
        {isGuest ? (
          <Pressable
            testID="player-send-invite-btn"
            onPress={onSendInvite}
            accessibilityRole="button"
            accessibilityLabel={`Invite ${displayName} to the Beach League app`}
            className="px-xl py-sm rounded-xl bg-brand-gold min-h-touch items-center justify-center active:opacity-70"
          >
            <AppText className="text-sm font-semibold text-on-brand-gold">Invite to App</AppText>
          </Pressable>
        ) : !interactionAvailable ? (
          <View className="items-center gap-xs">
            <AppText className="text-sm text-muted text-center">
              {safetyPending
                ? 'Checking interaction availability…'
                : blockedByViewer
                  ? 'You blocked this player.'
                  : "This interaction isn't available."}
            </AppText>
            {blockedByViewer && onUnblock != null && (
              <Pressable
                testID="player-unblock-btn"
                onPress={onUnblock}
                accessibilityRole="button"
                className="min-h-touch px-xl items-center justify-center rounded-xl border border-brand-teal"
              >
                <AppText className="text-sm font-semibold text-brand-teal">Unblock</AppText>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {relationship.canRespond ? (
              <>
                <RelationshipResponseButton
                  label="Accept"
                  testID="player-accept-friend-btn"
                  isLoading={isFriendActionLoading}
                  onPress={onAcceptFriend}
                  spinnerColor={palette.onBrandTeal}
                  primary
                />
                <RelationshipResponseButton
                  label="Decline"
                  testID="player-decline-friend-btn"
                  isLoading={isFriendActionLoading}
                  onPress={onDeclineFriend}
                  spinnerColor={palette.textDefault}
                />
              </>
            ) : relationship.profileLabel != null ? (
              <FriendButton
                label={relationship.profileLabel}
                canAdd={relationship.canAdd}
                isLoading={isFriendActionLoading}
                onPress={onAddFriend}
                spinnerColor={palette.onBrandTeal}
              />
            ) : null}
            {relationship.showMessage && (
              <Pressable
                testID="player-message-btn"
                onPress={onMessage}
                accessibilityRole="button"
                accessibilityLabel={`Send message to ${displayName}`}
                className="px-xl py-sm rounded-xl border-[1.5px] border-default min-h-touch items-center justify-center active:opacity-70"
              >
                <AppText className="text-sm font-semibold text-default">
                  Message
                </AppText>
              </Pressable>
            )}
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
  readonly label: string;
  readonly canAdd: boolean;
  readonly isLoading: boolean;
  readonly onPress: () => void;
  readonly spinnerColor: string;
}

function FriendButton({
  label,
  canAdd,
  isLoading,
  onPress,
  spinnerColor,
}: FriendButtonProps): React.ReactNode {
  const isDisabled = !canAdd || isLoading;

  return (
    <Pressable
      testID="player-add-friend-btn"
      onPress={isDisabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      className={`px-xl py-sm rounded-xl min-h-touch items-center justify-center active:opacity-70 ${
        isDisabled
          ? 'bg-elevated'
          : 'bg-brand-teal'
      }`}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <AppText
          className={`text-sm font-semibold ${
            isDisabled
              ? 'text-default'
              : 'text-on-brand-teal'
          }`}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

interface RelationshipResponseButtonProps {
  readonly label: 'Accept' | 'Decline';
  readonly testID: string;
  readonly isLoading: boolean;
  readonly onPress: () => void;
  readonly spinnerColor: string;
  readonly primary?: boolean;
}

function RelationshipResponseButton({
  label,
  testID,
  isLoading,
  onPress,
  spinnerColor,
  primary = false,
}: RelationshipResponseButtonProps): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      onPress={isLoading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} friend request`}
      disabled={isLoading}
      className={`px-lg py-sm rounded-xl min-h-touch items-center justify-center active:opacity-70 ${
        primary ? 'bg-brand-teal' : 'border-[1.5px] border-default'
      }`}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <AppText
          className={`text-sm font-semibold ${
            primary ? 'text-on-brand-teal' : 'text-default'
          }`}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
