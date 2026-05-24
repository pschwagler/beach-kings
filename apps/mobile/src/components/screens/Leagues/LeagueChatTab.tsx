/**
 * LeagueChatTab — Chat tab of the League Detail screen.
 *
 * Shows:
 *   Message list with date dividers and grouped bubbles
 *   Input bar with send button
 *
 * Wireframe ref: league-chat.html
 */

import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import ChatComposer from '@/components/ui/ChatComposer';
import ChatView from '@/components/ui/ChatView';
import { useBottomTabBarHeight } from '@/components/navigation/BottomTabBar';
import { useLeagueChatTab } from './useLeagueChatTab';
import type { LeagueChatMessage } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  readonly message: LeagueChatMessage;
  /**
   * True when this is the last message in a consecutive run from this sender.
   * Avatar + name appear below this bubble (bottom-of-run style).
   */
  readonly showSender: boolean;
}

function MessageBubble({ message, showSender }: MessageBubbleProps): React.ReactNode {
  const timeLabel = message.created_at
    ? new Date(message.created_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  if (message.is_mine) {
    return (
      <View
        testID={`message-bubble-${message.id}`}
        className="items-end px-4 mb-[6px]"
      >
        <View className="max-w-[80%] bg-brand-teal rounded-[16px] rounded-tr-[4px] px-4 py-[10px]">
          <Text className="text-[14px] text-white">{message.message}</Text>
        </View>
        <Text className="text-[10px] text-tertiary mt-[2px]">
          {timeLabel}
        </Text>
      </View>
    );
  }

  return (
    <View testID={`message-bubble-${message.id}`} className="px-4 mb-[6px]">
      <View className="flex-row items-end gap-2">
        {showSender ? (
          <View className="w-7 h-7 rounded-full bg-elevated items-center justify-center">
            <Text className="text-[9px] font-bold text-muted">
              {message.initials}
            </Text>
          </View>
        ) : (
          <View className="w-7" />
        )}
        <View className="max-w-[80%] bg-surface rounded-[16px] rounded-tl-[4px] px-4 py-[10px] border border-divider">
          <Text className="text-[14px] text-default">
            {message.message}
          </Text>
        </View>
      </View>
      {showSender && (
        <View className="flex-row items-center gap-2 mt-[2px]">
          <View className="w-7" />
          <Text className="text-[12px] font-semibold text-muted">
            {message.player_name ?? 'Unknown'}
          </Text>
        </View>
      )}
      <View className="flex-row items-center gap-2 mt-[2px]">
        <View className="w-7" />
        <Text className="text-[10px] text-tertiary">
          {timeLabel}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface LeagueChatTabProps {
  readonly leagueId: number | string;
}

export default function LeagueChatTab({ leagueId }: LeagueChatTabProps): React.ReactNode {
  // Composer starts above the BottomTabBar, so KeyboardStickyView overshoots
  // the keyboard top by exactly the tab bar's height. Measured via onLayout in
  // LeagueDetailScreen and provided through BottomTabBarHeightContext.
  const keyboardOpenedOffset = useBottomTabBarHeight();
  const {
    messages,
    isLoading,
    isError,
    messageText,
    isSending,
    sendError,
    onChangeText,
    onSend,
  } = useLeagueChatTab(leagueId);

  if (isLoading) {
    return (
      <View testID="chat-loading" className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        testID="chat-error"
        className="flex-1 items-center justify-center px-8"
      >
        <Text className="text-[16px] font-bold text-default text-center">
          Failed to load messages
        </Text>
      </View>
    );
  }

  return (
    <ChatView<LeagueChatMessage>
      testID="chat-tab"
      listTestID="chat-messages-list"
      keyboardOpenedOffset={keyboardOpenedOffset}
      data={messages}
      keyExtractor={(msg) => `msg-${msg.id}`}
      renderBubble={(msg, nextMsg) => (
        <MessageBubble
          message={msg}
          showSender={
            !msg.is_mine &&
            (nextMsg === null || nextMsg.player_id !== msg.player_id)
          }
        />
      )}
      getTimestamp={(msg) => msg.created_at ?? ''}
      renderComposer={() => (
        <ChatComposer
          value={messageText}
          onChangeText={onChangeText}
          onSend={() => { void onSend(); }}
          isSending={isSending}
          sendError={sendError}
          autoFocus={false}
          maxLength={1000}
          inputTestID="chat-message-input"
          sendTestID="chat-send-button"
        />
      )}
    />
  );
}
