/**
 * FriendRequestCard — an incoming friend request in the Social hub's Friends tab.
 *
 * A highlighted (info-tint) card with the sender's avatar, name, a meta line,
 * and stacked Accept / Decline actions. Tapping the sender's avatar or name
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
import { View, Text, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';
import { pluralize } from '@/lib/formatters';
import type { FriendRequest } from '@beach-kings/shared';

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
      className="flex-row gap-3 px-4 py-[14px] bg-info-tint border-b border-divider"
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
          <Text
            className="text-[14px] font-semibold text-default"
            numberOfLines={1}
          >
            {request.sender_name}
          </Text>
          <Text className="text-[12px] text-muted mt-[2px]" numberOfLines={1}>
            {requestMeta(request)}
          </Text>
        </Pressable>
        <View className="flex-row gap-2 mt-2">
          <Pressable
            testID={`accept-request-btn-${request.id}`}
            onPress={handleAccept}
            accessibilityRole="button"
            accessibilityLabel={`Accept friend request from ${request.sender_name}`}
            className="px-[18px] py-[10px] rounded-[8px] bg-brand-teal min-h-[44px] justify-center active:opacity-80"
          >
            <Text className="text-[12px] font-bold text-white">Accept</Text>
          </Pressable>
          <Pressable
            testID={`decline-request-btn-${request.id}`}
            onPress={handleDecline}
            accessibilityRole="button"
            accessibilityLabel={`Decline friend request from ${request.sender_name}`}
            className="px-[18px] py-[10px] rounded-[8px] bg-elevated min-h-[44px] justify-center active:opacity-70"
          >
            <Text className="text-[12px] font-bold text-muted">Decline</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
