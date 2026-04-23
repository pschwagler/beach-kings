/**
 * ConversationRow — single thread preview in the messages list.
 *
 * Mirrors the wireframe `.convo-item` design:
 * avatar | name + preview | timestamp + unread dot
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Conversation } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';

interface ConversationRowProps {
  readonly conversation: Conversation;
  readonly currentPlayerId: number | null;
  readonly onPress: (playerId: number, name?: string) => void;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
      className={`flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 ${
        hasUnread ? 'bg-amber-50 dark:bg-gray-800' : 'bg-white dark:bg-elevated'
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
                ? 'font-bold text-text-default dark:text-content-primary'
                : 'font-semibold text-text-default dark:text-content-primary'
            }`}
            numberOfLines={1}
          >
            {conversation.full_name}
          </Text>
          <Text className="text-xs text-text-muted dark:text-text-tertiary flex-shrink-0">
            {formatTimestamp(conversation.last_message_at)}
          </Text>
        </View>

        <Text
          className={`text-xs mt-0.5 ${
            hasUnread
              ? 'font-medium text-text-default dark:text-content-primary'
              : 'text-text-muted dark:text-text-tertiary'
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
          className="w-2.5 h-2.5 rounded-full bg-primary dark:bg-brand-teal ml-2 flex-shrink-0"
        />
      )}
    </Pressable>
  );
}
