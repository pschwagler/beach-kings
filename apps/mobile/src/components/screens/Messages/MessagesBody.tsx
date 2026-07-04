/**
 * MessagesBody — chrome-free inbox content for the Messages destination.
 *
 * Renders everything below the TopNav: search bar, conversation list, and the
 * loading / empty / error states. Presentational — all data and handlers arrive
 * via props (the shape of {@link UseMessagesScreenResult}) so the same body can
 * be composed inside both the standalone `MessagesScreen` and the Social hub
 * subnav without re-fetching or duplicating layout.
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
import Svg, { Path, Circle } from 'react-native-svg';
import ConversationRow from './ConversationRow';
import MessagesSkeleton from './MessagesSkeleton';
import MessagesErrorState from './MessagesErrorState';
import type { UseMessagesScreenResult } from './useMessagesScreen';
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
      className="px-4 py-3 bg-surface border-b border-strong"
    >
      <View className="flex-row items-center h-[40px] px-3 rounded-[10px] border border-strong bg-elevated gap-2">
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
          className="flex-1 text-[14px] text-default"
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
      <Text className="text-[16px] font-bold text-default mt-4 mb-[6px] text-center">
        No Messages Yet
      </Text>
      <Text className="text-[13px] text-muted text-center leading-[1.5]">
        Start a conversation with a friend or league member
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export type MessagesBodyProps = UseMessagesScreenResult;

export default function MessagesBody({
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
}: MessagesBodyProps): React.ReactNode {
  const renderContent = (): React.ReactNode => {
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
        <MessagesSearchBar value={searchQuery} onChangeText={setSearchQuery} />
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
    <View testID="messages-screen" className="flex-1">
      {renderContent()}
    </View>
  );
}
