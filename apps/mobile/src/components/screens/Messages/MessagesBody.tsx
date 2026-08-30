/**
 * MessagesBody — chrome-free inbox content for the Messages destination.
 *
 * Renders everything below the TopNav: search bar, conversation list, and the
 * loading / empty / error states. Presentational — all data and handlers arrive
 * via props (the shape of {@link UseMessagesScreenResult}) so the body can be
 * composed inside the Social hub's Messages tab (`MessagesTab`) without
 * re-fetching or duplicating layout.
 *
 * Wireframe ref: messages.html
 */

import React, { useEffect, useRef } from 'react';
import AppText from '@/components/ui/AppText';
import {
  View,
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
import { usePaletteColors } from '@/theme/usePaletteColors';

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface MessagesSearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly showHiddenAction: boolean;
  readonly onHiddenPress: () => void;
}

function MessagesSearchBar({
  value,
  onChangeText,
  showHiddenAction,
  onHiddenPress,
}: MessagesSearchBarProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View
      testID="messages-search-bar"
      className="px-4 py-3 bg-surface border-b border-strong"
    >
      <View className="flex-row items-center gap-2">
      <View className="flex-1 flex-row items-center min-h-touch px-3 rounded-[10px] border border-strong bg-elevated gap-2">
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx={11} cy={11} r={8} stroke={palette.textTertiary} strokeWidth={2} />
          <Path d="M21 21l-4.35-4.35" stroke={palette.textTertiary} strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <TextInput
          testID="messages-search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder="Search messages..."
          placeholderTextColor={palette.textTertiary}
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
                stroke={palette.textTertiary}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </Pressable>
        )}
      </View>
      {showHiddenAction && (
        <Pressable
          testID="hidden-messages-btn"
          onPress={onHiddenPress}
          accessibilityRole="button"
          accessibilityLabel="View hidden messages"
          className="min-h-touch px-2 items-center justify-center"
        >
          <AppText className="text-sm font-bold text-brand-teal">Hidden</AppText>
        </Pressable>
      )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function MessagesEmptyState({
  onCompose,
  hidden,
}: {
  readonly onCompose?: () => void;
  readonly hidden: boolean;
}): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View
      testID="messages-empty-state"
      className="flex-1 items-center justify-center px-8 py-[60px]"
    >
      <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
        <Path
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          stroke={palette.textTertiary}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <AppText className="text-[16px] font-bold text-default mt-4 mb-[6px] text-center">
        {hidden ? 'No Hidden Messages' : 'No Messages Yet'}
      </AppText>
      <AppText className="text-[13px] text-muted text-center leading-[1.5]">
        {hidden
          ? 'Conversations you hide will appear here'
          : 'Start a conversation with any player'}
      </AppText>
      {onCompose != null && (
        <Pressable
          testID="messages-empty-compose-btn"
          onPress={onCompose}
          accessibilityRole="button"
          accessibilityLabel="Find someone to message"
          className="mt-5 min-h-touch items-center justify-center rounded-button bg-brand-gold px-5"
        >
          <AppText className="text-[14px] font-bold text-on-brand-gold">Find someone to message</AppText>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export type MessagesBodyProps = UseMessagesScreenResult & {
  readonly onCompose?: () => void;
  readonly scrollRequest?: number;
};

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
  folder,
  onConversationVisibility,
  onHiddenPress,
  onCompose,
  scrollRequest = 0,
}: MessagesBodyProps): React.ReactNode {
  const listRef = useRef<FlatList<Conversation>>(null);

  useEffect(() => {
    if (scrollRequest > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [scrollRequest]);

  const renderContent = (): React.ReactNode => {
    if (isLoading && !isRefreshing) {
      return (
        <>
          <MessagesSearchBar
            value=""
            onChangeText={() => undefined}
            showHiddenAction={folder === 'inbox'}
            onHiddenPress={onHiddenPress}
          />
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
          showHiddenAction={folder === 'inbox'}
          onHiddenPress={onHiddenPress}
        />
        {conversations.length === 0 ? (
          <MessagesEmptyState onCompose={folder === 'inbox' ? onCompose : undefined} hidden={folder === 'hidden'} />
        ) : (
          <FlatList<Conversation>
            ref={listRef}
            testID="conversations-list"
            data={conversations as Conversation[]}
            keyExtractor={(item) => String(item.player_id)}
            renderItem={({ item }) => (
              <ConversationRow
                conversation={item}
                onPress={onConversationPress}
                currentPlayerId={currentPlayerId}
                onVisibilityChange={onConversationVisibility}
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
