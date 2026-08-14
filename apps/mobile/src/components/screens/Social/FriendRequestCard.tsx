/**
 * FriendRequestCard — an incoming friend request in the Social hub's Friends tab.
 *
 * A compact list row with the sender's avatar, name, a meta line, and
 * Accept / Decline actions. Tapping the sender's avatar or name
 * opens their profile so it can be reviewed before responding. Accept/decline
 * are handled optimistically upstream in {@link useFriends}. The meta line
 * matches the wireframe's
 * "league · N mutual friends": a shared-league prefix when one exists, the
 * mutual-friend count when nonzero, and "Wants to be friends" when neither
 * is available.
 *
 * Wireframe ref: friends.html — .request-card
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';
import { pluralize } from '@/lib/formatters';
import type { FriendRequest } from '@beach-kings/shared';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface FriendRequestCardProps {
  readonly request: FriendRequest;
  readonly onAccept: (id: number) => void;
  readonly onDecline: (id: number) => void;
  /** Opens the requester's profile so it can be reviewed before responding. */
  readonly onPress: (playerId: number) => void;
}

/** "league · N mutual friends" per the wireframe; generic fallback otherwise. */
function requestMeta(request: FriendRequest): string {
  const parts = [
    request.shared_league_name,
    request.mutual_friends_count > 0
      ? pluralize(request.mutual_friends_count, 'mutual friend')
      : null,
  ].filter((part) => part != null);
  return parts.length > 0 ? parts.join(' · ') : 'Wants to be friends';
}

export default function FriendRequestCard({
  request,
  onAccept,
  onDecline,
  onPress,
}: FriendRequestCardProps): React.ReactNode {
  const palette = usePaletteColors();
  const handleAccept = useCallback(
    () => onAccept(request.id),
    [onAccept, request.id],
  );
  const handleDecline = useCallback(
    () => onDecline(request.id),
    [onDecline, request.id],
  );
  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(request.sender_player_id);
  }, [onPress, request.sender_player_id]);

  return (
    <View
      testID={`friend-request-card-${request.id}`}
      className="flex-row gap-md px-lg py-md bg-surface border-b border-divider"
    >
      <Pressable
        testID={`friend-request-sender-${request.id}`}
        onPress={handlePress}
        accessible={false}
        className="active:opacity-70"
      >
        <Avatar
          imageUrl={request.sender_avatar}
          name={request.sender_name}
          size="md"
          colorSeed={request.sender_player_id}
          accessible={false}
        />
      </Pressable>
      <View className="flex-1 min-w-0">
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`View profile of ${request.sender_name}`}
          className="active:opacity-70"
        >
          <AppText
            className="text-subhead font-semibold text-default"
            numberOfLines={1}
          >
            {request.sender_name}
          </AppText>
          <AppText className="text-caption text-muted mt-xxs" numberOfLines={1}>
            {requestMeta(request)}
          </AppText>
        </Pressable>
        <View className="flex-row items-center gap-xs mt-xs">
          <Pressable
            testID={`accept-request-btn-${request.id}`}
            onPress={handleAccept}
            accessibilityRole="button"
            accessibilityLabel={`Accept friend request from ${request.sender_name}`}
            className="min-h-touch justify-center rounded-button bg-brand-teal px-md active:opacity-pressed"
            style={{ backgroundColor: palette.brandTeal }}
          >
            <AppText
              className="text-footnote font-semibold text-on-brand-teal"
              style={{ color: palette.onBrandTeal }}
            >
              Accept
            </AppText>
          </Pressable>
          <Pressable
            testID={`decline-request-btn-${request.id}`}
            onPress={handleDecline}
            accessibilityRole="button"
            accessibilityLabel={`Decline friend request from ${request.sender_name}`}
            className="min-h-touch justify-center rounded-button px-md active:bg-elevated"
          >
            <AppText className="text-footnote font-medium text-muted">Decline</AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
