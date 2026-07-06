/**
 * ConversationRow — a single conversation item in the messages inbox.
 *
 * Wireframe ref: messages.html — .convo-item
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { type Conversation, formatRelativeTime } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';

interface ConversationRowProps {
  readonly conversation: Conversation;
  readonly onPress: (playerId: number, name: string) => void;
  readonly currentPlayerId: number;
}

export default function ConversationRow({
  conversation,
  onPress,
  currentPlayerId,
}: ConversationRowProps): React.ReactNode {
  const isUnread = conversation.unread_count > 0;
  const isSentByMe = conversation.last_message_sender_id === currentPlayerId;

  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(conversation.player_id, conversation.full_name);
  }, [onPress, conversation.player_id, conversation.full_name]);

  return (
    <Pressable
      testID={`convo-row-${conversation.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${conversation.full_name}`}
      className={`flex-row items-center gap-3 px-4 py-[14px] border-b border-divider active:opacity-70 ${
        isUnread ? 'bg-warning-tint' : 'bg-surface'
      }`}
    >
      {/* Avatar */}
      <Avatar
        imageUrl={conversation.avatar}
        name={conversation.full_name}
        size="md"
        colorSeed={conversation.player_id}
        accessible={false}
      />

      {/* Body */}
      <View className="flex-1 min-w-0">
        <View className="flex-row justify-between items-center">
          <Text
            className={`text-[15px] ${
              isUnread
                ? 'font-bold text-default'
                : 'font-semibold text-default'
            }`}
            numberOfLines={1}
          >
            {conversation.full_name}
          </Text>
          <Text className="text-[11px] text-muted flex-shrink-0 ml-2">
            {formatRelativeTime(conversation.last_message_at, { style: 'short' })}
          </Text>
        </View>
        <Text
          className={`text-[13px] mt-[3px] ${
            isUnread
              ? 'text-default font-medium'
              : 'text-muted'
          }`}
          numberOfLines={1}
        >
          {isSentByMe ? 'You: ' : ''}
          {conversation.last_message_text}
        </Text>
      </View>

      {/* Unread indicator */}
      {isUnread && (
        <View
          testID={`convo-unread-dot-${conversation.player_id}`}
          className="w-[10px] h-[10px] rounded-full bg-[#2a7d9c] flex-shrink-0"
        />
      )}
    </Pressable>
  );
}
