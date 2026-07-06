/**
 * FriendRequestCard — an incoming friend request in the Social hub's Friends tab.
 *
 * A highlighted (info-tint) card with the sender's avatar, name, a meta line,
 * and stacked Accept / Decline actions. Accept/decline are handled optimistically
 * upstream in {@link useFriends}. The meta line shows "N mutual friends" when
 * the backend reports any; "Wants to be friends" is the zero-mutuals fallback.
 * (The wireframe's league prefix is tracked in the parity plan's Backlog epic.)
 *
 * Wireframe ref: friends.html — .request-card
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { pluralize } from '@/lib/formatters';
import type { FriendRequest } from '@beach-kings/shared';

interface FriendRequestCardProps {
  readonly request: FriendRequest;
  readonly onAccept: (id: number) => void;
  readonly onDecline: (id: number) => void;
}

export default function FriendRequestCard({
  request,
  onAccept,
  onDecline,
}: FriendRequestCardProps): React.ReactNode {
  const handleAccept = useCallback(
    () => onAccept(request.id),
    [onAccept, request.id],
  );
  const handleDecline = useCallback(
    () => onDecline(request.id),
    [onDecline, request.id],
  );

  return (
    <View
      testID={`friend-request-card-${request.id}`}
      className="flex-row gap-3 px-4 py-[14px] bg-info-tint border-b border-divider"
    >
      <Avatar
        imageUrl={request.sender_avatar}
        name={request.sender_name}
        size="md"
        colorSeed={request.sender_player_id}
        accessible={false}
      />
      <View className="flex-1 min-w-0">
        <Text
          className="text-[14px] font-semibold text-default"
          numberOfLines={1}
        >
          {request.sender_name}
        </Text>
        <Text className="text-[12px] text-muted mt-[2px]">
          {request.mutual_friends_count > 0
            ? pluralize(request.mutual_friends_count, 'mutual friend')
            : 'Wants to be friends'}
        </Text>
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
