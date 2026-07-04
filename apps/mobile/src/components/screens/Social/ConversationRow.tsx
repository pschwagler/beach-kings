/**
 * ConversationRow — single thread preview in the messages list.
 *
 * Mirrors the wireframe `.convo-item` design:
 * avatar | name + preview | timestamp + unread dot
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { type Conversation, formatRelativeTime } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';

interface ConversationRowProps {
  readonly conversation: Conversation;
  readonly currentPlayerId: number | null;
  readonly onPress: (playerId: number, name?: string) => void;
}

export default function ConversationRow({
  conversation,
  currentPlayerId,
  onPress,
}: ConversationRowProps): React.ReactNode {
  const hasUnread = conversation.unread_count > 0;
  const isOutgoing = conversation.last_message_sender_id === currentPlayerId;

  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(conversation.player_id, conversation.full_name);
  }, [onPress, conversation.player_id, conversation.full_name]);

  return (
    <Pressable
      testID={`conversation-row-${conversation.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${conversation.full_name}`}
      className={`flex-row items-center px-4 py-3 border-b border-divider ${
        hasUnread ? 'bg-warning-tint' : 'bg-elevated'
      } active:opacity-70`}
    >
      {/* Avatar */}
      <Avatar
        imageUrl={conversation.avatar}
        name={conversation.full_name}
        size="md"
        className="flex-shrink-0"
      />

      {/* Body */}
      <View className="flex-1 ml-3 min-w-0">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-sm flex-1 mr-2 ${
              hasUnread
                ? 'font-bold text-default'
                : 'font-semibold text-default'
            }`}
            numberOfLines={1}
          >
            {conversation.full_name}
          </Text>
          <Text className="text-xs text-muted flex-shrink-0">
            {formatRelativeTime(conversation.last_message_at, { style: 'short' })}
          </Text>
        </View>

        <Text
          className={`text-xs mt-0.5 ${
            hasUnread
              ? 'font-medium text-default'
              : 'text-muted'
          }`}
          numberOfLines={1}
        >
          {isOutgoing ? `You: ${conversation.last_message_text}` : conversation.last_message_text}
        </Text>
      </View>

      {/* Unread indicator */}
      {hasUnread && (
        <View
          testID="unread-dot"
          className="w-2.5 h-2.5 rounded-full bg-brand-teal ml-2 flex-shrink-0"
        />
      )}
    </Pressable>
  );
}
