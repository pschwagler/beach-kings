/**
 * FindPlayersScreen — discover new players and manage friends.
 *
 * Two tabs:
 *   Players — discover players, add as friend
 *   Friends — view friends and accept/decline incoming requests
 *
 * Wireframe ref: find-players.html, friends.html
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { hapticLight } from '@/utils/haptics';
import TopNav from '@/components/ui/TopNav';
import PlayerRow from './PlayerRow';
import FindPlayersSkeleton from './FindPlayersSkeleton';
import FindPlayersErrorState from './FindPlayersErrorState';
import { useFindPlayersScreen } from './useFindPlayersScreen';
import type { Friend, FriendRequest } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface SearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
}

function FindPlayersSearchBar({
  value,
  onChangeText,
  placeholder = 'Search players…',
}: SearchBarProps): React.ReactNode {
  return (
    <View className="px-4 py-3 bg-white dark:bg-dark-surface border-b border-[#f0f0f0] dark:border-border-strong">
      <View className="flex-row items-center bg-[#f5f5f5] dark:bg-dark-elevated rounded-[10px] px-[12px] h-[40px] gap-[8px]">
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx="11" cy="11" r="8" stroke="#999" strokeWidth={2} />
          <Path
            d="M21 21l-4.35-4.35"
            stroke="#999"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
        <TextInput
          testID="find-players-search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#999"
          className="flex-1 text-[14px] text-text-default dark:text-content-primary"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          clearButtonMode="while-editing"
          accessibilityLabel="Search players"
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Friend request card
// ---------------------------------------------------------------------------

interface FriendRequestCardProps {
  readonly request: FriendRequest;
  readonly onAccept: (id: number) => void;
  readonly onDecline: (id: number) => void;
}

function FriendRequestCard({
  request,
  onAccept,
  onDecline,
}: FriendRequestCardProps): React.ReactNode {
  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((w) => w[0] ?? '')
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  return (
    <View
      testID={`friend-request-card-${request.id}`}
      className="flex-row items-center gap-3 px-4 py-[14px] bg-white dark:bg-dark-surface border-b border-[#f0f0f0] dark:border-border-strong"
    >
      <View className="w-12 h-12 rounded-full bg-[#ddd] dark:bg-dark-elevated items-center justify-center flex-shrink-0">
        <Text className="text-[#666] dark:text-content-secondary font-bold text-base">
          {getInitials(request.sender_name)}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className="text-[14px] font-semibold text-text-default dark:text-content-primary"
          numberOfLines={1}
        >
          {request.sender_name}
        </Text>
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]">
          Wants to be friends
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          testID={`accept-request-btn-${request.id}`}
          onPress={() => onAccept(request.id)}
          accessibilityRole="button"
          accessibilityLabel={`Accept friend request from ${request.sender_name}`}
          className="px-[14px] py-[10px] rounded-[8px] bg-[#1a3a4a] dark:bg-brand-teal min-h-[44px] justify-center active:opacity-80"
        >
          <Text className="text-[12px] font-bold text-white">Accept</Text>
        </Pressable>
        <Pressable
          testID={`decline-request-btn-${request.id}`}
          onPress={() => onDecline(request.id)}
          accessibilityRole="button"
          accessibilityLabel={`Decline friend request from ${request.sender_name}`}
          className="px-[14px] py-[10px] rounded-[8px] border border-[#ccc] dark:border-border-strong min-h-[44px] justify-center active:opacity-70"
        >
          <Text className="text-[12px] font-bold text-text-secondary dark:text-content-secondary">
            Decline
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Friend row
// ---------------------------------------------------------------------------

interface FriendRowProps {
  readonly friend: Friend;
  readonly onPress: (playerId: number) => void;
}

function FriendRow({ friend, onPress }: FriendRowProps): React.ReactNode {
  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((w) => w[0] ?? '')
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(friend.player_id);
  }, [onPress, friend.player_id]);

  return (
    <Pressable
      testID={`friend-row-${friend.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`View profile of ${friend.full_name}`}
      className="flex-row items-center gap-3 px-4 py-[14px] bg-white dark:bg-dark-surface border-b border-[#f0f0f0] dark:border-border-strong active:opacity-70"
    >
      <View className="w-12 h-12 rounded-full bg-[#ddd] dark:bg-dark-elevated items-center justify-center flex-shrink-0">
        <Text className="text-[#666] dark:text-content-secondary font-bold text-base">
          {getInitials(friend.full_name)}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className="text-[14px] font-semibold text-text-default dark:text-content-primary"
          numberOfLines={1}
        >
          {friend.full_name}
        </Text>
        {friend.location_name != null && (
          <Text
            className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]"
            numberOfLines={1}
          >
            {friend.location_name}
          </Text>
        )}
      </View>
      {friend.level != null && (
        <View className="bg-[#e8f4f8] dark:bg-teal-900 rounded-[8px] px-2 py-[2px]">
          <Text className="text-[10px] font-bold text-[#2a7d9c] dark:text-teal-300">
            {friend.level}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function PlayersEmptyState(): React.ReactNode {
  return (
    <View
      testID="players-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <Text className="text-[18px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
        No Players Found
      </Text>
      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.5]">
        Try adjusting your search to discover more players.
      </Text>
    </View>
  );
}

function FriendsEmptyState(): React.ReactNode {
  return (
    <View
      testID="friends-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <Text className="text-[18px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
        No Friends Yet
      </Text>
      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.5]">
        Switch to the Players tab to discover and add friends.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  readonly activeTab: 'players' | 'friends';
  readonly onTabPress: (tab: 'players' | 'friends') => void;
}

function FindPlayersTabBar({
  activeTab,
  onTabPress,
}: TabBarProps): React.ReactNode {
  const tabs: Array<{ key: 'players' | 'friends'; label: string }> = [
    { key: 'players', label: 'Players' },
    { key: 'friends', label: 'Friends' },
  ];

  return (
    <View className="flex-row border-b border-[#f0f0f0] dark:border-border-strong bg-white dark:bg-dark-surface">
      {tabs.map(({ key, label }) => {
        const isActive = key === activeTab;
        return (
          <Pressable
            key={key}
            testID={`tab-${key}`}
            onPress={() => {
              void hapticLight();
              onTabPress(key);
            }}
            className="flex-1 py-[14px] items-center justify-center"
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Text
              className={`text-[14px] font-semibold ${
                isActive
                  ? 'text-[#1a3a4a] dark:text-brand-teal'
                  : 'text-text-secondary dark:text-content-secondary'
              }`}
            >
              {label}
            </Text>
            {isActive && (
              <View className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#1a3a4a] dark:bg-brand-teal" />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function FindPlayersScreen(): React.ReactNode {
  const {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    // Players tab
    players,
    isLoadingPlayers,
    playersError,
    isRefreshingPlayers,
    onRefreshPlayers,
    onRetryPlayers,
    onAddFriend,
    pendingSendIds,
    // Friends tab
    friends,
    friendRequests,
    isLoadingFriends,
    friendsError,
    isRefreshingFriends,
    onRefreshFriends,
    onRetryFriends,
    onAcceptRequest,
    onDeclineRequest,
    // Shared
    onPlayerPress,
  } = useFindPlayersScreen();

  const renderPlayersTab = (): React.ReactNode => {
    if (isLoadingPlayers && !isRefreshingPlayers) {
      return <FindPlayersSkeleton count={6} />;
    }
    if (playersError != null && !isRefreshingPlayers) {
      return <FindPlayersErrorState onRetry={onRetryPlayers} />;
    }
    if (players.length === 0) {
      return <PlayersEmptyState />;
    }
    return (
      <FlatList
        testID="players-list"
        data={players}
        keyExtractor={(item) => String(item.player_id)}
        renderItem={({ item }) => (
          <PlayerRow
            player={item}
            onPress={onPlayerPress}
            onAddFriend={onAddFriend}
            isPendingSend={pendingSendIds.has(item.player_id)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingPlayers}
            onRefresh={onRefreshPlayers}
          />
        }
      />
    );
  };

  type FriendListItem =
    | { kind: 'request'; request: FriendRequest }
    | { kind: 'friend'; friend: Friend };

  const renderFriendsTab = (): React.ReactNode => {
    if (isLoadingFriends && !isRefreshingFriends) {
      return <FindPlayersSkeleton count={5} />;
    }
    if (friendsError != null && !isRefreshingFriends) {
      return <FindPlayersErrorState onRetry={onRetryFriends} />;
    }
    if (friends.length === 0 && friendRequests.length === 0) {
      return <FriendsEmptyState />;
    }

    const listItems: FriendListItem[] = [
      ...friendRequests.map(
        (r): FriendListItem => ({ kind: 'request', request: r }),
      ),
      ...friends.map(
        (f): FriendListItem => ({ kind: 'friend', friend: f }),
      ),
    ];

    return (
      <FlatList<FriendListItem>
        testID="friends-list"
        data={listItems}
        keyExtractor={(item) =>
          item.kind === 'request'
            ? `req-${item.request.id}`
            : `friend-${item.friend.player_id}`
        }
        renderItem={({ item }) => {
          if (item.kind === 'request') {
            return (
              <FriendRequestCard
                request={item.request}
                onAccept={onAcceptRequest}
                onDecline={onDeclineRequest}
              />
            );
          }
          return <FriendRow friend={item.friend} onPress={onPlayerPress} />;
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingFriends}
            onRefresh={onRefreshFriends}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Find Players" showBack />
      <View testID="find-players-screen" className="flex-1">
        <FindPlayersSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <FindPlayersTabBar
          activeTab={activeTab}
          onTabPress={setActiveTab}
        />
        {activeTab === 'players' ? renderPlayersTab() : renderFriendsTab()}
      </View>
    </SafeAreaView>
  );
}
