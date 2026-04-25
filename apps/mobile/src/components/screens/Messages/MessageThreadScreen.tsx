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

import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import Avatar from '@/components/ui/Avatar';
import ChatComposer from '@/components/ui/ChatComposer';
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
  const insets = useSafeAreaInsets();
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
        behavior="padding"
        style={{ flex: 1 }}
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
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
          />
        )}
        <ChatComposer
          value={messageText}
          onChangeText={setMessageText}
          onSend={onSend}
          isSending={isSending}
          sendError={sendError}
          bottomInset={insets.bottom}
          inputTestID="message-input"
          sendTestID="send-btn"
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
