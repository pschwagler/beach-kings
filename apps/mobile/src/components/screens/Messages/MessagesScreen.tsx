/**
 * MessagesScreen — inbox view showing all DM conversations.
 *
 * Renders:
 *   - search bar to filter conversations
 *   - list of ConversationRow items
 *   - skeleton while loading
 *   - empty state when no conversations
 *   - error state with retry on failure
 *   - pull-to-refresh
 *
 * Wireframe ref: messages.html
 */

import React from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import TopNav from '@/components/ui/TopNav';
import { useMessagesScreen } from './useMessagesScreen';
import ConversationRow from './ConversationRow';
import MessagesSkeleton from './MessagesSkeleton';
import MessagesErrorState from './MessagesErrorState';
import type { Conversation } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface MessagesSearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}

function MessagesSearchBar({
  value,
  onChangeText,
}: MessagesSearchBarProps): React.ReactNode {
  return (
    <View
      testID="messages-search-bar"
      className="px-4 py-3 bg-white dark:bg-dark-surface border-b border-border dark:border-border-strong"
    >
      <View className="flex-row items-center h-[40px] px-3 rounded-[10px] border border-[#e0e0e0] dark:border-border-strong bg-[#f8f9fa] dark:bg-dark-elevated gap-2">
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx={11} cy={11} r={8} stroke="#999" strokeWidth={2} />
          <Path d="M21 21l-4.35-4.35" stroke="#999" strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <TextInput
          testID="messages-search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder="Search messages..."
          placeholderTextColor="#999"
          className="flex-1 text-[14px] text-text-default dark:text-content-primary"
          keyboardType="default"
          autoComplete="off"
          textContentType="none"
          returnKeyType="search"
          accessibilityLabel="Search messages"
        />
        {value.length > 0 && (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={12}
            accessibilityLabel="Clear search"
            accessibilityRole="button"
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path
                d="M18 6L6 18M6 6l12 12"
                stroke="#999"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function MessagesEmptyState(): React.ReactNode {
  return (
    <View
      testID="messages-empty-state"
      className="flex-1 items-center justify-center px-8 py-[60px]"
    >
      <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
        <Path
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          stroke="#ccc"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text className="text-[16px] font-bold text-text-default dark:text-content-primary mt-4 mb-[6px] text-center">
        No Messages Yet
      </Text>
      <Text className="text-[13px] text-text-muted dark:text-content-secondary text-center leading-[1.5]">
        Start a conversation with a friend or league member
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function MessagesScreen(): React.ReactNode {
  const router = useRouter();
  const {
    conversations,
    isLoading,
    error,
    isRefreshing,
    searchQuery,
    setSearchQuery,
    onRefresh,
    onRetry,
    onConversationPress,
    currentPlayerId,
  } = useMessagesScreen();

  const composeAction = (
    <Pressable
      testID="messages-compose-btn"
      onPress={() => router.push('/(stack)/find-players')}
      accessibilityRole="button"
      accessibilityLabel="Start a new conversation"
      className="min-w-touch min-h-touch items-center justify-center active:opacity-70"
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );

  const renderBody = (): React.ReactNode => {
    if (isLoading && !isRefreshing) {
      return (
        <>
          <MessagesSearchBar value="" onChangeText={() => undefined} />
          <MessagesSkeleton />
        </>
      );
    }

    if (error != null && !isRefreshing) {
      return <MessagesErrorState onRetry={onRetry} />;
    }

    return (
      <>
        <MessagesSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {conversations.length === 0 ? (
          <MessagesEmptyState />
        ) : (
          <FlatList<Conversation>
            testID="conversations-list"
            data={conversations as Conversation[]}
            keyExtractor={(item) => String(item.player_id)}
            renderItem={({ item }) => (
              <ConversationRow
                conversation={item}
                onPress={onConversationPress}
                currentPlayerId={currentPlayerId}
              />
            )}
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
          />
        )}
      </>
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Messages" showBack rightAction={composeAction} />
      <View testID="messages-screen" className="flex-1">
        {renderBody()}
      </View>
    </SafeAreaView>
  );
}
