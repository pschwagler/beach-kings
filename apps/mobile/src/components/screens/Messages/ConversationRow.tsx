/**
 * ConversationRow — a single conversation item in the messages inbox.
 *
 * Wireframe ref: messages.html — .convo-item
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Conversation } from '@beach-kings/shared';
import { hapticLight } from '@/utils/haptics';

/** Returns initials from a full name (up to 2 chars). */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Format a message timestamp for the conversation list.
 * - < 1 hour → "Xm ago"
 * - < 24 h → "Xh ago"
 * - yesterday → "Yesterday"
 * - else → month/day
 */
function formatConvoTime(isoString: string): string {
  const now = Date.now();
  const ts = new Date(isoString).getTime();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${Math.max(diffMin, 1)}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffHr < 48) return 'Yesterday';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
  const initials = getInitials(conversation.full_name);

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
      className={`flex-row items-center gap-3 px-4 py-[14px] border-b border-[#f0f0f0] dark:border-border-strong active:opacity-70 ${
        isUnread
          ? 'bg-[#fdf8ed] dark:bg-yellow-950'
          : 'bg-white dark:bg-dark-surface'
      }`}
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-[#7fb3c7] items-center justify-center flex-shrink-0">
        <Text className="text-white font-bold text-base">{initials}</Text>
      </View>

      {/* Body */}
      <View className="flex-1 min-w-0">
        <View className="flex-row justify-between items-center">
          <Text
            className={`text-[15px] ${
              isUnread
                ? 'font-bold text-text-default dark:text-content-primary'
                : 'font-semibold text-text-default dark:text-content-primary'
            }`}
            numberOfLines={1}
          >
            {conversation.full_name}
          </Text>
          <Text className="text-[11px] text-text-secondary dark:text-content-secondary flex-shrink-0 ml-2">
            {formatConvoTime(conversation.last_message_at)}
          </Text>
        </View>
        <Text
          className={`text-[13px] mt-[3px] ${
            isUnread
              ? 'text-text-default dark:text-content-primary font-medium'
              : 'text-text-secondary dark:text-content-secondary'
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
