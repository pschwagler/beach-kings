/**
 * FriendsBody — chrome-free content for the Social hub's Friends tab.
 *
 * Renders the friend search bar and a single sectioned FlatList of:
 *   - Pending Requests (N)  → FriendRequestCard rows (accept / decline)
 *   - My Friends (N)        → FriendRow rows
 *   - Suggested Friends     → SuggestionRow rows (add)
 * plus the loading / error / empty states.
 *
 * Presentational: all data and handlers arrive via props (the {@link useFriends}
 * result shape, plus search + navigation callbacks) so the same body can be
 * composed inside the Social subnav without owning a data hook. A friend-requests
 * fetch failure is non-fatal — surfaced as an inline notice above the list —
 * while a friends-list failure shows the full-page error state.
 *
 * While the search box is active the view scopes to the (filtered) friends list
 * only: the unfiltered Pending Requests / Suggested Friends sections are hidden
 * so a no-match search reads as "No matches" rather than a half-populated list.
 *
 * Wireframe ref: friends.html
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
} from 'react-native';
import type { ListRenderItem } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { hapticLight } from '@/utils/haptics';
import type { Friend, FriendRequest } from '@beach-kings/shared';
import type { UseFriendsResult } from '@/components/screens/FindPlayers/useFriends';
import FriendRow from './FriendRow';
import FriendRequestCard from './FriendRequestCard';
import SuggestionRow from './SuggestionRow';

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface FriendsSearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}

function FriendsSearchBar({
  value,
  onChangeText,
}: FriendsSearchBarProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View className="px-4 py-3 bg-surface border-b border-divider">
      <View className="flex-row items-center bg-elevated rounded-[10px] px-[12px] h-[40px] gap-[8px]">
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx={11} cy={11} r={8} stroke={palette.textTertiary} strokeWidth={2} />
          <Path
            d="M21 21l-4.35-4.35"
            stroke={palette.textTertiary}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
        <TextInput
          testID="friends-search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder="Search friends..."
          placeholderTextColor={palette.textTertiary}
          className="flex-1 text-[14px] text-default"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          clearButtonMode="while-editing"
          accessibilityLabel="Search friends"
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ label }: { label: string }): React.ReactNode {
  return (
    <Text className="text-[15px] font-bold text-default px-4 pt-[14px] pb-2">
      {label}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function FriendsLoadingSkeleton(): React.ReactNode {
  return (
    <View testID="friends-loading">
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className="flex-row items-center gap-3 px-4 py-3 bg-surface border-b border-divider"
        >
          <LoadingSkeleton width={40} height={40} borderRadius={20} />
          <View className="flex-1 gap-[6px]">
            <LoadingSkeleton width={140} height={14} borderRadius={6} />
            <LoadingSkeleton width={100} height={12} borderRadius={5} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------

function FriendsEmptyState({
  onFindPlayers,
}: {
  readonly onFindPlayers: () => void;
  readonly scrollRequest?: number;
}): React.ReactNode {
  const palette = usePaletteColors();
  const handlePress = useCallback(() => {
    void hapticLight();
    onFindPlayers();
  }, [onFindPlayers]);

  return (
    <View
      testID="friends-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <View className="mb-3 opacity-40">
        <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
          <Path
            d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
            stroke={palette.textTertiary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={9} cy={7} r={4} stroke={palette.textTertiary} strokeWidth={2} />
          <Path
            d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
            stroke={palette.textTertiary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <Text className="text-[16px] font-bold text-default mb-1 text-center">
        No friends yet
      </Text>
      <Text className="text-[13px] text-muted text-center leading-[1.4] mb-4">
        Connect with players you meet on the court.
      </Text>
      <Pressable
        testID="friends-empty-find-players"
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Find Players"
        className="bg-brand-teal rounded-xl px-6 py-3 min-h-[44px] justify-center active:opacity-80"
      >
        <Text className="text-white font-bold text-[14px]">Find Players</Text>
      </Pressable>
    </View>
  );
}

function FriendsNoResults({ query }: { readonly query: string }): React.ReactNode {
  return (
    <View
      testID="friends-no-results"
      className="items-center justify-center px-8 py-12"
    >
      <Text className="text-[15px] font-bold text-default mb-1 text-center">
        No matches
      </Text>
      <Text className="text-[13px] text-muted text-center leading-[1.4]">
        No friends match &ldquo;{query.trim()}&rdquo;.
      </Text>
    </View>
  );
}

function FriendsErrorState({
  onRetry,
}: {
  readonly onRetry: () => void;
}): React.ReactNode {
  const handleRetry = useCallback(() => {
    void hapticLight();
    onRetry();
  }, [onRetry]);

  return (
    <View
      testID="friends-error-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <Text className="text-[18px] font-bold text-default mb-2 text-center">
        Could Not Load Friends
      </Text>
      <Text className="text-[14px] text-muted text-center leading-[1.5] mb-6">
        Something went wrong while loading your friends. Check your connection
        and try again.
      </Text>
      <Pressable
        testID="friends-retry-btn"
        onPress={handleRetry}
        accessibilityRole="button"
        accessibilityLabel="Try Again"
        className="bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
      >
        <Text className="text-white font-bold text-[15px]">Try Again</Text>
      </Pressable>
    </View>
  );
}

/**
 * Non-blocking inline notice shown above the list when the friend-requests
 * fetch fails. The friends list still renders below; this only communicates
 * that pending requests could not be loaded.
 */
function FriendRequestsErrorNotice({
  onRetry,
}: {
  readonly onRetry: () => void;
}): React.ReactNode {
  const handleRetry = useCallback(() => {
    void hapticLight();
    onRetry();
  }, [onRetry]);

  return (
    <View
      testID="friend-requests-error-notice"
      accessibilityRole="alert"
      className="flex-row items-center justify-between gap-3 mx-4 mt-3 mb-1 px-4 py-3 rounded-[10px] bg-danger-tint border border-danger"
    >
      <Text className="flex-1 text-[13px] text-danger">
        Couldn&apos;t load friend requests.
      </Text>
      <Pressable
        testID="friend-requests-error-retry"
        onPress={handleRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading friend requests"
        hitSlop={8}
      >
        <Text className="text-[13px] font-bold text-danger">Retry</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// List model
// ---------------------------------------------------------------------------

type FriendsListItem =
  | { readonly kind: 'section'; readonly key: string; readonly label: string }
  | { readonly kind: 'request'; readonly request: FriendRequest }
  | { readonly kind: 'friend'; readonly friend: Friend }
  | { readonly kind: 'suggestion'; readonly suggestion: Friend };

function buildListItems(
  friendRequests: readonly FriendRequest[],
  friends: readonly Friend[],
  suggestions: readonly Friend[],
): FriendsListItem[] {
  const items: FriendsListItem[] = [];

  if (friendRequests.length > 0) {
    items.push({
      kind: 'section',
      key: 'section-requests',
      label: `Pending Requests (${friendRequests.length})`,
    });
    friendRequests.forEach((request) =>
      items.push({ kind: 'request', request }),
    );
  }

  if (friends.length > 0) {
    items.push({
      kind: 'section',
      key: 'section-friends',
      label: `My Friends (${friends.length})`,
    });
    friends.forEach((friend) => items.push({ kind: 'friend', friend }));
  }

  if (suggestions.length > 0) {
    items.push({
      kind: 'section',
      key: 'section-suggestions',
      label: 'Suggested Friends',
    });
    suggestions.forEach((suggestion) =>
      items.push({ kind: 'suggestion', suggestion }),
    );
  }

  return items;
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export interface FriendsBodyProps extends UseFriendsResult {
  readonly searchQuery: string;
  readonly setSearchQuery: (q: string) => void;
  /** Navigate to a player's profile. */
  readonly onPlayerPress: (playerId: number) => void;
  /** Navigate to the Find Players destination (empty-state CTA). */
  readonly onFindPlayers: () => void;
  readonly scrollRequest?: number;
}

export default function FriendsBody({
  friends,
  friendRequests,
  suggestions,
  isLoadingFriends,
  isLoadingSuggestions,
  friendsError,
  friendRequestsError,
  isRefreshingFriends,
  onRefreshFriends,
  onRetryFriends,
  onAcceptRequest,
  onDeclineRequest,
  pendingAddIds,
  onAddSuggestion,
  searchQuery,
  setSearchQuery,
  onPlayerPress,
  onFindPlayers,
  scrollRequest = 0,
}: FriendsBodyProps): React.ReactNode {
  const listRef = useRef<FlatList<FriendsListItem>>(null);
  const requestsFailed = friendRequestsError != null && !isRefreshingFriends;

  useEffect(() => {
    if (scrollRequest > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [scrollRequest]);

  const renderItem = useCallback<ListRenderItem<FriendsListItem>>(
    ({ item }) => {
      switch (item.kind) {
        case 'section':
          return <SectionLabel label={item.label} />;
        case 'request':
          return (
            <FriendRequestCard
              request={item.request}
              onAccept={onAcceptRequest}
              onDecline={onDeclineRequest}
              onPress={onPlayerPress}
            />
          );
        case 'friend':
          return <FriendRow friend={item.friend} onPress={onPlayerPress} />;
        case 'suggestion':
          return (
            <SuggestionRow
              suggestion={item.suggestion}
              onAdd={onAddSuggestion}
              onPress={onPlayerPress}
              isPending={pendingAddIds.has(item.suggestion.player_id)}
            />
          );
        default:
          return null;
      }
    },
    [
      onAcceptRequest,
      onDeclineRequest,
      onPlayerPress,
      onAddSuggestion,
      pendingAddIds,
    ],
  );

  const renderContent = (): React.ReactNode => {
    if (isLoadingFriends && !isRefreshingFriends) {
      return (
        <>
          <FriendsSearchBar value="" onChangeText={() => undefined} />
          <FriendsLoadingSkeleton />
        </>
      );
    }

    if (friendsError != null && !isRefreshingFriends) {
      return <FriendsErrorState onRetry={onRetryFriends} />;
    }

    // While searching, scope the view to the friends list only. The box is
    // labelled "Search friends…", so the unfiltered Pending Requests / Suggested
    // Friends sections (and the requests-error notice) would be noise — hide
    // them so "No matches" fires whenever the friend filter comes up empty.
    const isSearching = searchQuery.trim() !== '';
    const visibleRequests = isSearching ? [] : friendRequests;
    const visibleSuggestions = isSearching ? [] : suggestions;
    const showRequestsNotice = requestsFailed && !isSearching;

    const isEmpty =
      friends.length === 0 &&
      visibleRequests.length === 0 &&
      visibleSuggestions.length === 0;

    if (isEmpty && !showRequestsNotice) {
      // Suggestions load decoupled from the primary content; with nothing
      // else to show yet, hold the skeleton rather than flash "No friends
      // yet" before a Suggested Friends section can still arrive.
      if (isLoadingSuggestions && !isSearching) {
        return (
          <>
            <FriendsSearchBar value="" onChangeText={() => undefined} />
            <FriendsLoadingSkeleton />
          </>
        );
      }
      return (
        <>
          <FriendsSearchBar value={searchQuery} onChangeText={setSearchQuery} />
          {isSearching ? (
            <FriendsNoResults query={searchQuery} />
          ) : (
            <FriendsEmptyState onFindPlayers={onFindPlayers} />
          )}
        </>
      );
    }

    const listItems = buildListItems(
      visibleRequests,
      friends,
      visibleSuggestions,
    );

    return (
      <>
        <FriendsSearchBar value={searchQuery} onChangeText={setSearchQuery} />
        <FlatList<FriendsListItem>
          ref={listRef}
          testID="friends-list"
          data={listItems}
          keyExtractor={(item) => {
            switch (item.kind) {
              case 'section':
                return item.key;
              case 'request':
                return `req-${item.request.id}`;
              case 'friend':
                return `friend-${item.friend.player_id}`;
              case 'suggestion':
                return `suggestion-${item.suggestion.player_id}`;
            }
          }}
          ListHeaderComponent={
            showRequestsNotice ? (
              <FriendRequestsErrorNotice onRetry={onRetryFriends} />
            ) : null
          }
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshingFriends}
              onRefresh={onRefreshFriends}
            />
          }
        />
      </>
    );
  };

  return (
    <View testID="friends-screen" className="flex-1">
      {renderContent()}
    </View>
  );
}
