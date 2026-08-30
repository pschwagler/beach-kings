/**
 * ConversationRow — a single conversation item in the messages inbox.
 *
 * Wireframe ref: messages.html — .convo-item
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { Alert, View, Pressable } from 'react-native';
import { type Conversation, formatRelativeTime } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';

interface ConversationRowProps {
  readonly conversation: Conversation;
  readonly onPress: (playerId: number, name: string) => void;
  readonly currentPlayerId: number;
  readonly onVisibilityChange: (playerId: number, hidden: boolean) => Promise<void>;
}

export default function ConversationRow({
  conversation,
  onPress,
  currentPlayerId,
  onVisibilityChange,
}: ConversationRowProps): React.ReactNode {
  const isUnread = conversation.unread_count > 0;
  const isSentByMe = conversation.last_message_sender_id === currentPlayerId;
  const relativeTime = formatRelativeTime(conversation.last_message_at, { style: 'short' });
  const accessibilityLabel = [
    `Conversation with ${conversation.full_name}`,
    isUnread
      ? `${conversation.unread_count} unread ${conversation.unread_count === 1 ? 'message' : 'messages'}`
      : 'No unread messages',
    `${isSentByMe ? 'You said' : 'Latest message'}: ${conversation.last_message_text}`,
    relativeTime,
  ].join('. ');

  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(conversation.player_id, conversation.full_name);
  }, [onPress, conversation.player_id, conversation.full_name]);

  const changeVisibility = useCallback(() => {
    const hidden = !conversation.is_hidden;
    const apply = () => {
      void onVisibilityChange(conversation.player_id, hidden).catch(() => {
        Alert.alert('Could not update conversation', 'Please try again.');
      });
    };
    if (!hidden) {
      apply();
      return;
    }
    Alert.alert(
      'Hide conversation?',
      `Messages from ${conversation.full_name} will stay in Hidden without notifications or badges.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Hide', onPress: apply },
      ],
    );
  }, [conversation.full_name, conversation.is_hidden, conversation.player_id, onVisibilityChange]);

  return (
    <Pressable
      testID={`convo-row-${conversation.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`flex-row items-center gap-3 px-4 py-[14px] border-b border-divider active:opacity-70 ${
        isUnread ? 'bg-warning-tint' : 'bg-surface'
      }`}
    >
      {/* Avatar */}
      <Avatar
        testID={`convo-avatar-${conversation.player_id}`}
        imageUrl={conversation.avatar}
        name={conversation.full_name}
        size="md"
        colorSeed={conversation.player_id}
        accessible={false}
      />

      {/* Body */}
      <View className="flex-1 min-w-0">
        <View className="flex-row justify-between items-center">
          <AppText
            className={`text-[15px] ${
              isUnread
                ? 'font-bold text-default'
                : 'font-semibold text-default'
            }`}
            numberOfLines={2}
          >
            {conversation.full_name}
          </AppText>
          <AppText className="text-[11px] text-muted flex-shrink-0 ml-2">
            {relativeTime}
          </AppText>
        </View>
        <AppText
          className={`text-[13px] mt-[3px] ${
            isUnread
              ? 'text-default font-medium'
              : 'text-muted'
          }`}
          numberOfLines={1}
        >
          {isSentByMe ? 'You: ' : ''}
          {conversation.last_message_text}
        </AppText>
      </View>

      {/* Unread indicator */}
      {isUnread && (
        <View
          testID={`convo-unread-dot-${conversation.player_id}`}
          className="w-[10px] h-[10px] rounded-full bg-brand-teal flex-shrink-0"
        />
      )}
      <Pressable
        testID={`convo-visibility-${conversation.player_id}`}
        onPress={changeVisibility}
        accessibilityRole="button"
        accessibilityLabel={`${conversation.is_hidden ? 'Restore' : 'Hide'} conversation with ${conversation.full_name}`}
        hitSlop={8}
        className="min-h-touch min-w-touch items-center justify-center"
      >
        <AppText className="text-lg text-muted">•••</AppText>
      </Pressable>
    </Pressable>
  );
}
