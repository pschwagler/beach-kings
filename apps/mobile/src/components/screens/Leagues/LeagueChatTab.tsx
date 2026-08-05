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
import AppText from '@/components/ui/AppText';
import { View, ActivityIndicator } from 'react-native';
import ChatComposer from '@/components/ui/ChatComposer';
import ChatView from '@/components/ui/ChatView';
import Avatar from '@/components/ui/Avatar';
import { ChatIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
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
          <AppText className="text-[14px] text-on-brand-teal">{message.message}</AppText>
        </View>
        <AppText className="text-[10px] text-tertiary mt-[2px]">
          {timeLabel}
        </AppText>
      </View>
    );
  }

  return (
    <View testID={`message-bubble-${message.id}`} className="px-4 mb-[6px]">
      <View className="flex-row items-end gap-2">
        {showSender ? (
          <Avatar
            imageUrl={message.avatar_url}
            name={message.player_name ?? 'Unknown'}
            size={28}
            colorSeed={message.player_id ?? message.user_id}
            accessible={false}
          />
        ) : (
          <View className="w-7" />
        )}
        <View className="max-w-[80%] bg-surface rounded-[16px] rounded-tl-[4px] px-4 py-[10px] border border-divider">
          <AppText className="text-[14px] text-default">
            {message.message}
          </AppText>
        </View>
      </View>
      {showSender && (
        <View className="flex-row items-center gap-2 mt-[2px]">
          <View className="w-7" />
          <AppText className="text-[12px] font-semibold text-muted">
            {message.player_name ?? 'Unknown'}
          </AppText>
        </View>
      )}
      <View className="flex-row items-center gap-2 mt-[2px]">
        <View className="w-7" />
        <AppText className="text-[10px] text-tertiary">
          {timeLabel}
        </AppText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function LeagueChatEmptyState(): React.ReactNode {
  const palette = usePaletteColors();

  return (
    <View
      testID="league-chat-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <View className="w-16 h-16 rounded-full bg-info-tint items-center justify-center mb-4">
        <ChatIcon size={32} color={palette.brandTeal} />
      </View>
      <AppText className="text-[18px] font-bold text-default text-center mb-2">
        No messages yet
      </AppText>
      <AppText className="text-[14px] text-muted text-center leading-[1.5]">
        Be the first to message your league.
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface LeagueChatTabProps {
  readonly leagueId: number | string;
  readonly draft: string;
  readonly onDraftChange: (value: string) => void;
}

export default function LeagueChatTab({
  leagueId,
  draft,
  onDraftChange,
}: LeagueChatTabProps): React.ReactNode {
  const {
    messages,
    isLoading,
    isError,
    messageText,
    isSending,
    sendError,
    onChangeText,
    onSend,
  } = useLeagueChatTab(leagueId, draft, onDraftChange);

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
        <AppText className="text-[16px] font-bold text-default text-center">
          Failed to load messages
        </AppText>
      </View>
    );
  }

  return (
    <ChatView<LeagueChatMessage>
      testID="chat-tab"
      listTestID="chat-messages-list"
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
      emptyState={<LeagueChatEmptyState />}
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
