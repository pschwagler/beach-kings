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
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { hapticLight } from '@/utils/haptics';
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
  const timeLabel = new Date(message.sent_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (message.is_mine) {
    return (
      <View
        testID={`message-bubble-${message.id}`}
        className="items-end px-4 mb-[6px]"
      >
        <View className="max-w-[80%] bg-[#1a3a4a] dark:bg-brand-teal rounded-[16px] rounded-tr-[4px] px-4 py-[10px]">
          <Text className="text-[14px] text-white">{message.text}</Text>
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
            {message.display_name}
          </Text>
        </View>
      )}
      <View className="flex-row items-end gap-2">
        {!showSender && <View className="w-7" />}
        <View className="max-w-[80%] bg-white dark:bg-dark-surface rounded-[16px] rounded-tl-[4px] px-4 py-[10px] border border-[#e8e8e8] dark:border-border-subtle">
          <Text className="text-[14px] text-text-default dark:text-content-primary">
            {message.text}
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
// Input bar
// ---------------------------------------------------------------------------

interface InputBarProps {
  readonly value: string;
  readonly onChangeText: (v: string) => void;
  readonly onSend: () => void;
  readonly isSending: boolean;
}

function ChatInputBar({ value, onChangeText, onSend, isSending }: InputBarProps): React.ReactNode {
  return (
    <View className="flex-row items-end px-3 py-2 bg-white dark:bg-dark-surface border-t border-[#e8e8e8] dark:border-border-strong gap-2">
      <View className="flex-1 min-h-[40px] max-h-[120px] bg-[#f5f5f5] dark:bg-dark-elevated rounded-[20px] px-4 justify-center">
        <TextInput
          testID="chat-message-input"
          value={value}
          onChangeText={onChangeText}
          placeholder="Message…"
          placeholderTextColor="#999"
          className="text-[15px] text-text-default dark:text-content-primary py-[10px]"
          multiline
          returnKeyType="default"
          autoCapitalize="sentences"
          autoCorrect
          maxLength={1000}
        />
      </View>

      <Pressable
        testID="chat-send-button"
        onPress={() => {
          void hapticLight();
          onSend();
        }}
        disabled={value.trim().length === 0 || isSending}
        className={`w-[40px] h-[40px] rounded-full items-center justify-center ${
          value.trim().length > 0 && !isSending
            ? 'bg-[#1a3a4a] dark:bg-brand-teal active:opacity-80'
            : 'bg-[#ddd] dark:bg-dark-elevated'
        }`}
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        {isSending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
              stroke={value.trim().length > 0 ? '#fff' : '#aaa'}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </Pressable>
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
    const msgDate = msg.sent_at.split('T')[0] ?? '';
    if (msgDate !== lastDate) {
      listData.push({ kind: 'divider', key: `divider-${msgDate}`, date: msg.sent_at });
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
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
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
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
      />

      <ChatInputBar
        value={messageText}
        onChangeText={onChangeText}
        onSend={() => { void onSend(); }}
        isSending={isSending}
      />
    </KeyboardAvoidingView>
  );
}
