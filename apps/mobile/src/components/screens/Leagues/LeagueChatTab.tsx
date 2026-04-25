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
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import ChatComposer from '@/components/ui/ChatComposer';
import { useLeagueChatTab } from './useLeagueChatTab';
import type { LeagueChatMessage } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// List item union type (divider or message)
// ---------------------------------------------------------------------------

type ListItem =
  | { kind: 'divider'; key: string; date: string }
  | { kind: 'message'; message: LeagueChatMessage; showSender: boolean };

// ---------------------------------------------------------------------------
// Date divider
// ---------------------------------------------------------------------------

function DateDivider({ date }: { readonly date: string }): React.ReactNode {
  const label = new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View className="flex-row items-center px-4 py-3 gap-3">
      <View className="flex-1 h-[1px] bg-[#e0e0e0] dark:bg-border-subtle" />
      <Text className="text-[11px] text-text-secondary dark:text-content-secondary font-medium">
        {label}
      </Text>
      <View className="flex-1 h-[1px] bg-[#e0e0e0] dark:bg-border-subtle" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  readonly message: LeagueChatMessage;
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
        <View className="max-w-[80%] bg-[#1a3a4a] dark:bg-brand-teal rounded-[16px] rounded-tr-[4px] px-4 py-[10px]">
          <Text className="text-[14px] text-white">{message.message}</Text>
        </View>
        <Text className="text-[10px] text-text-muted dark:text-content-tertiary mt-[2px]">
          {timeLabel}
        </Text>
      </View>
    );
  }

  return (
    <View testID={`message-bubble-${message.id}`} className="px-4 mb-[6px]">
      {showSender && (
        <View className="flex-row items-center gap-2 mb-[4px]">
          <View className="w-7 h-7 rounded-full bg-[#ddd] dark:bg-dark-elevated items-center justify-center">
            <Text className="text-[9px] font-bold text-[#666] dark:text-content-secondary">
              {message.initials}
            </Text>
          </View>
          <Text className="text-[12px] font-semibold text-text-secondary dark:text-content-secondary">
            {message.player_name ?? 'Unknown'}
          </Text>
        </View>
      )}
      <View className="flex-row items-end gap-2">
        {!showSender && <View className="w-7" />}
        <View className="max-w-[80%] bg-white dark:bg-dark-surface rounded-[16px] rounded-tl-[4px] px-4 py-[10px] border border-[#e8e8e8] dark:border-border-subtle">
          <Text className="text-[14px] text-text-default dark:text-content-primary">
            {message.message}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2 mt-[2px]">
        <View className="w-7" />
        <Text className="text-[10px] text-text-muted dark:text-content-tertiary">
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
  const insets = useSafeAreaInsets();
  const {
    messages,
    isLoading,
    isError,
    messageText,
    isSending,
    onChangeText,
    onSend,
    flatListRef,
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
        <Text className="text-[16px] font-bold text-text-default dark:text-content-primary text-center">
          Failed to load messages
        </Text>
      </View>
    );
  }

  const listData: ListItem[] = [];
  let lastDate = '';
  let lastSenderId: number | null = null;

  messages.forEach((msg) => {
    const msgDate = msg.created_at?.split('T')[0] ?? '';
    if (msgDate !== lastDate) {
      listData.push({
        kind: 'divider',
        key: `divider-${msgDate}`,
        date: msg.created_at ?? '',
      });
      lastDate = msgDate;
      lastSenderId = null;
    }
    const showSender = !msg.is_mine && msg.player_id !== lastSenderId;
    listData.push({ kind: 'message', message: msg, showSender });
    lastSenderId = msg.player_id;
  });

  return (
    <KeyboardAvoidingView
      testID="chat-tab"
      behavior="padding"
      style={{ flex: 1 }}
      className="bg-[#f5f5f5] dark:bg-base"
    >
      <FlatList<ListItem>
        ref={flatListRef as React.RefObject<FlatList<ListItem> | null>}
        testID="chat-messages-list"
        data={listData}
        keyExtractor={(item) =>
          item.kind === 'divider' ? item.key : `msg-${item.message.id}`
        }
        renderItem={({ item }): React.ReactElement | null => {
          if (item.kind === 'divider') {
            return <DateDivider date={item.date} />;
          }
          return (
            <MessageBubble
              message={item.message}
              showSender={item.showSender}
            />
          );
        }}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
      />

      <ChatComposer
        value={messageText}
        onChangeText={onChangeText}
        onSend={() => { void onSend(); }}
        isSending={isSending}
        maxLength={1000}
        bottomInset={insets.bottom}
        inputTestID="chat-message-input"
        sendTestID="chat-send-button"
      />
    </KeyboardAvoidingView>
  );
}
