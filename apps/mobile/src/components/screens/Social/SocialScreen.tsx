/**
 * SocialScreen — Messages-forward hub for the Social tab.
 *
 * Layout decision: segmented control ("Messages" | "Friends") rather than
 * stacked sections. Rationale:
 *  - The wireframe's social-subnav is a top-level nav between Messages,
 *    Notifications, Friends, Find Players. On mobile a tab-in-tab would
 *    add a 3rd navigation layer; a segmented control keeps depth at two.
 *  - Messages is the primary CTA (ChatIcon badge), Friends is secondary.
 *  - Stacking both sections in one scroll would bury threads under friend
 *    requests on every render, which is the opposite of what the badge implies.
 *
 * The "Messages" segment renders the full conversation list with pull-to-refresh.
 * The "Friends" segment is a shortcut CTA that navigates to find-players,
 * matching the wireframe's friends.html "Find Players" empty-state action.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  Text,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Conversation } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import useApi from '@/hooks/useApi';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import TopNav from '@/components/ui/TopNav';
import SegmentControl from '@/components/ui/SegmentControl';
import EmptyState from '@/components/ui/EmptyState';
import ConversationRow from './ConversationRow';
import ConversationSkeleton from './ConversationSkeleton';
import FriendsShortcut from './FriendsShortcut';

const SEGMENTS = ['Messages', 'Friends'] as const;
type Segment = (typeof SEGMENTS)[number];
const SEGMENT_MESSAGES = 0;
const SEGMENT_FRIENDS = 1;

async function fetchConversations(): Promise<readonly Conversation[]> {
  const result = await api.getConversations(1, 50);
  return result.items;
}

interface SocialScreenProps {
  /** Injected in tests to replace the API call. */
  readonly fetcherOverride?: () => Promise<readonly Conversation[]>;
}

export default function SocialScreen({
  fetcherOverride,
}: SocialScreenProps): React.ReactNode {
  const router = useRouter();
  const { user } = useAuth();
  const currentPlayerId = (user as { player_id?: number } | null)?.player_id ?? null;

  const [selectedSegment, setSelectedSegment] = useState<number>(SEGMENT_MESSAGES);

  const fetcher = fetcherOverride ?? fetchConversations;

  const {
    data: conversations,
    isLoading,
    error,
    refetch,
  } = useApi<readonly Conversation[]>(fetcher, []);

  const { refreshing, onRefresh } = usePullToRefresh(refetch);

  const handleThreadPress = useCallback(
    (playerId: number, name?: string) => {
      router.push(routes.messagesThread(playerId, name));
    },
    [router],
  );

  const handleFindPlayers = useCallback(() => {
    router.push(routes.findPlayers());
  }, [router]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow
        conversation={item}
        currentPlayerId={currentPlayerId}
        onPress={handleThreadPress}
      />
    ),
    [currentPlayerId, handleThreadPress],
  );

  const keyExtractor = useCallback(
    (item: Conversation) => String(item.player_id),
    [],
  );

  function renderMessagesContent(): React.ReactNode {
    if (isLoading) {
      return <ConversationSkeleton count={6} />;
    }

    if (error != null) {
      return (
        <View
          testID="social-error"
          className="flex-1 items-center justify-center px-6 py-10"
        >
          <Text className="text-base font-semibold text-center text-text-default dark:text-content-primary mb-2">
            Could not load messages
          </Text>
          <Text className="text-sm text-center text-text-muted dark:text-text-tertiary mb-4">
            {error.message}
          </Text>
          <Pressable
            testID="retry-button"
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading messages"
            className="bg-primary dark:bg-brand-teal rounded-xl px-6 py-3 active:opacity-70"
          >
            <Text className="text-white font-semibold text-sm">Retry</Text>
          </Pressable>
        </View>
      );
    }

    const items = conversations ?? [];

    if (items.length === 0) {
      return (
        <EmptyState
          title="No conversations yet"
          description="Start a conversation with a friend or league member"
          actionLabel="Find Players"
          onAction={handleFindPlayers}
        />
      );
    }

    return (
      <FlatList
        testID="conversations-list"
        data={items as Conversation[]}
        renderItem={renderConversation}
        keyExtractor={keyExtractor}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2a7d9c"
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base" edges={['top']}>
      <TopNav title="Social" />

      {/* Segmented control */}
      <View className="px-4 py-2 bg-white dark:bg-elevated border-b border-gray-100 dark:border-gray-800">
        <SegmentControl
          segments={[...SEGMENTS]}
          selectedIndex={selectedSegment}
          onSelect={setSelectedSegment}
        />
      </View>

      {/* Content */}
      <View className="flex-1">
        {selectedSegment === SEGMENT_MESSAGES
          ? renderMessagesContent()
          : <FriendsShortcut onFindPlayers={handleFindPlayers} />}
      </View>
    </SafeAreaView>
  );
}
