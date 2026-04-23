/**
 * MessageThreadScreen — single DM conversation view.
 *
 * Renders:
 *   - list of sent/received messages, ordered newest-first (reversed to appear bottom-up)
 *   - date dividers
 *   - keyboard-avoiding input bar with send button
 *   - skeleton while loading
 *   - error state with retry on failure
 *
 * Wireframe ref: message-thread.html
 */

import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  TextInput,
  Pressable,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Polygon } from 'react-native-svg';
import Avatar from '@/components/ui/Avatar';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { routes } from '@/lib/navigation';
import { useMessageThreadScreen } from './useMessageThreadScreen';
import MessagesSkeleton from './MessagesSkeleton';
import MessagesErrorState from './MessagesErrorState';
import type { DirectMessage } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  readonly message: DirectMessage;
  readonly isOwn: boolean;
}

function formatMsgTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function MessageBubble({ message, isOwn }: MessageBubbleProps): React.ReactNode {
  return (
    <View
      className={`mb-3 ${isOwn ? 'items-end' : 'items-start'}`}
    >
      <View
        testID={`msg-bubble-${message.id}`}
        className={`max-w-[280px] px-[14px] py-[10px] rounded-2xl ${
          isOwn
            ? 'bg-[#1a3a4a] rounded-br-sm'
            : 'bg-white dark:bg-dark-surface rounded-bl-sm shadow-sm'
        }`}
      >
        <Text
          className={`text-[14px] leading-[1.4] ${
            isOwn
              ? 'text-white'
              : 'text-text-default dark:text-content-primary'
          }`}
        >
          {message.message_text}
        </Text>
        <Text
          className={`text-[11px] mt-1 ${
            isOwn
              ? 'text-white/50'
              : 'text-text-secondary dark:text-content-secondary'
          }`}
        >
          {formatMsgTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Date divider
// ---------------------------------------------------------------------------

function DateDivider({ date }: { date: string }): React.ReactNode {
  return (
    <View className="items-center py-2">
      <Text className="text-[11px] text-text-secondary dark:text-content-secondary">
        {date}
      </Text>
    </View>
  );
}

function formatDateDivider(isoString: string): string {
  const d = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isSameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Thread empty state
// ---------------------------------------------------------------------------

function ThreadEmptyState(): React.ReactNode {
  return (
    <View
      testID="thread-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <Text className="text-[14px] text-text-muted dark:text-content-secondary text-center">
        No messages yet. Say hello!
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Input bar
// ---------------------------------------------------------------------------

interface InputBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSend: () => void;
  readonly isSending: boolean;
  readonly sendError: string | null;
}

function InputBar({
  value,
  onChangeText,
  onSend,
  isSending,
  sendError,
}: InputBarProps): React.ReactNode {
  const inputRef = useRef<TextInput>(null);

  return (
    <View className="bg-white dark:bg-dark-surface border-t border-border dark:border-border-strong">
      {sendError != null && (
        <View className="px-4 py-2 bg-red-50 dark:bg-error-bg">
          <Text className="text-[12px] text-red-600 dark:text-red-400">
            {sendError}
          </Text>
        </View>
      )}
      <View className="flex-row items-center gap-[10px] px-4 py-[10px] pb-[20px]">
        <TextInput
          testID="message-input"
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder="Message..."
          placeholderTextColor="#999"
          className="flex-1 min-h-[44px] px-[14px] rounded-[20px] border border-[#e0e0e0] dark:border-border-strong bg-[#f8f9fa] dark:bg-dark-elevated text-[14px] text-text-default dark:text-content-primary"
          multiline
          keyboardType="default"
          autoComplete="off"
          textContentType="none"
          returnKeyType="send"
          onSubmitEditing={onSend}
          accessibilityLabel="Type a message"
        />
        <Pressable
          testID="send-btn"
          onPress={onSend}
          disabled={isSending || value.trim() === ''}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          className={`w-[44px] h-[44px] rounded-full items-center justify-center ${
            value.trim() === ''
              ? 'bg-[#e0e0e0] dark:bg-dark-elevated'
              : 'bg-[#1a3a4a] dark:bg-brand-teal active:opacity-80'
          }`}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
              <Polygon points="5 3 19 12 5 21 5 3" fill="#fff" />
            </Svg>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface MessageThreadScreenProps {
  readonly playerId: number;
  readonly playerName: string;
  /** The current authenticated player's ID (for own-message detection). */
  readonly currentPlayerId: number;
}

export default function MessageThreadScreen({
  playerId,
  playerName,
  currentPlayerId,
}: MessageThreadScreenProps): React.ReactNode {
  const router = useRouter();
  const {
    messages,
    isLoading,
    error,
    isRefreshing,
    messageText,
    setMessageText,
    isSending,
    sendError,
    onRefresh,
    onRetry,
    onSend,
  } = useMessageThreadScreen(playerId);

  const displayName =
    playerName != null && playerName.trim().length > 0 ? playerName : 'Chat';

  const onBack = useCallback(() => {
    router.back();
  }, [router]);

  const onProfile = useCallback(() => {
    router.push(routes.player(playerId));
  }, [router, playerId]);

  const renderBody = (): React.ReactNode => {
    if (isLoading && !isRefreshing) {
      return <MessagesSkeleton count={4} />;
    }

    if (error != null && !isRefreshing) {
      return <MessagesErrorState onRetry={onRetry} />;
    }

    // Reversed so newest message is at the bottom when inverted=false with newest first data
    const reversedMessages = [...messages].reverse();

    // Insert date dividers by grouping consecutive messages on the same day.
    type ListItem =
      | { kind: 'message'; message: DirectMessage }
      | { kind: 'divider'; label: string };

    const listItems: ListItem[] = [];
    let lastDateLabel: string | null = null;
    for (const msg of reversedMessages) {
      const label = formatDateDivider(msg.created_at);
      if (label !== lastDateLabel) {
        listItems.push({ kind: 'divider', label });
        lastDateLabel = label;
      }
      listItems.push({ kind: 'message', message: msg });
    }

    return (
      <KeyboardAvoidingView
        testID="thread-screen"
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={88}
      >
        {messages.length === 0 ? (
          <ThreadEmptyState />
        ) : (
          <FlatList<ListItem>
            testID="messages-list"
            data={listItems}
            keyExtractor={(item, idx) =>
              item.kind === 'message'
                ? `msg-${item.message.id}`
                : `divider-${idx}`
            }
            renderItem={({ item }) => {
              if (item.kind === 'divider') {
                return <DateDivider date={item.label} />;
              }
              return (
                <MessageBubble
                  message={item.message}
                  isOwn={item.message.sender_player_id === currentPlayerId}
                />
              );
            }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
          />
        )}
        <InputBar
          value={messageText}
          onChangeText={setMessageText}
          onSend={onSend}
          isSending={isSending}
          sendError={sendError}
        />
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      edges={['top']}
    >
      <View className="h-12 bg-nav dark:bg-nav-dark flex-row items-center px-3 gap-2 dark:border-b dark:border-border-subtle">
        <Pressable
          testID="thread-back-btn"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Messages"
          className="min-w-touch min-h-touch flex-row items-center"
        >
          <ChevronLeftIcon size={18} color="#ffffff" />
          <Text className="text-white text-[15px] font-medium ml-0.5">Messages</Text>
        </Pressable>

        <Avatar name={displayName} size="sm" className="ml-1" />

        <View className="flex-1 min-w-0">
          <Text
            className="text-white text-[15px] font-bold"
            numberOfLines={1}
            accessibilityRole="header"
          >
            {displayName}
          </Text>
        </View>

        <Pressable
          testID="thread-profile-btn"
          onPress={onProfile}
          accessibilityRole="button"
          accessibilityLabel={`View ${displayName}'s profile`}
          className="min-h-touch items-end justify-center px-1"
        >
          <Text className="text-white text-[14px] font-medium">Profile</Text>
        </Pressable>
      </View>
      {renderBody()}
    </SafeAreaView>
  );
}
