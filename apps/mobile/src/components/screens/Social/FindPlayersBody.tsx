/**
 * FindPlayersBody — chrome-free content for the Social hub's Find Players tab.
 *
 * Renders the player search bar and a single FlatList of discoverable players
 * ({@link PlayerRow}, add-friend with optimistic pending state), plus the
 * loading / error / empty states.
 *
 * Presentational: all data and handlers arrive via props (the
 * {@link useDiscoverPlayers} result shape, plus search + navigation callbacks)
 * so the same body can be composed inside the Social subnav without owning a
 * data hook.
 *
 * Deliberately discover-only: friend management lives in its own Friends subnav
 * tab now, so the old internal Players|Friends tab bar is dropped. Filter chips
 * are also omitted — the backend discover endpoint takes no filter params yet
 * (tracked in the backlog).
 *
 * Wireframe ref: find-players.html
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  RefreshControl,
} from 'react-native';
import type { ListRenderItem } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { usePaletteColors } from '@/theme/usePaletteColors';
import PlayerRow from '@/components/screens/FindPlayers/PlayerRow';
import type { DiscoverPlayer } from '@/components/screens/FindPlayers/PlayerRow';
import FindPlayersSkeleton from '@/components/screens/FindPlayers/FindPlayersSkeleton';
import FindPlayersErrorState from '@/components/screens/FindPlayers/FindPlayersErrorState';
import type { UseDiscoverPlayersResult } from '@/components/screens/FindPlayers/useDiscoverPlayers';

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface PlayersSearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}

function PlayersSearchBar({
  value,
  onChangeText,
}: PlayersSearchBarProps): React.ReactNode {
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
          testID="find-players-search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder="Search players..."
          placeholderTextColor={palette.textTertiary}
          className="flex-1 text-[14px] text-default"
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
// Empty states
// ---------------------------------------------------------------------------

function PlayersEmptyState({
  isSearching,
}: {
  readonly isSearching: boolean;
}): React.ReactNode {
  return (
    <View
      testID="find-players-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <Text className="text-[18px] font-bold text-default mb-2 text-center">
        No Players Found
      </Text>
      <Text className="text-[14px] text-muted text-center leading-[1.5]">
        {isSearching
          ? 'Try adjusting your search to discover more players.'
          : 'Check back soon — new players join all the time.'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export interface FindPlayersBodyProps extends UseDiscoverPlayersResult {
  readonly searchQuery: string;
  readonly setSearchQuery: (q: string) => void;
  /** Navigate to a player's profile. */
  readonly onPlayerPress: (playerId: number) => void;
}

export default function FindPlayersBody({
  players,
  isLoadingPlayers,
  playersError,
  isRefreshingPlayers,
  onRefreshPlayers,
  onRetryPlayers,
  onAddFriend,
  pendingSendIds,
  searchQuery,
  setSearchQuery,
  onPlayerPress,
}: FindPlayersBodyProps): React.ReactNode {
  const renderItem = useCallback<ListRenderItem<DiscoverPlayer>>(
    ({ item }) => (
      <PlayerRow
        player={item}
        onPress={onPlayerPress}
        onAddFriend={onAddFriend}
        isPendingSend={pendingSendIds.has(item.player_id)}
      />
    ),
    [onPlayerPress, onAddFriend, pendingSendIds],
  );

  const renderContent = (): React.ReactNode => {
    if (isLoadingPlayers && !isRefreshingPlayers) {
      return (
        <>
          <PlayersSearchBar value="" onChangeText={() => undefined} />
          <FindPlayersSkeleton count={6} />
        </>
      );
    }

    if (playersError != null && !isRefreshingPlayers) {
      return <FindPlayersErrorState onRetry={onRetryPlayers} />;
    }

    if (players.length === 0) {
      return (
        <>
          <PlayersSearchBar value={searchQuery} onChangeText={setSearchQuery} />
          <PlayersEmptyState isSearching={searchQuery.trim() !== ''} />
        </>
      );
    }

    return (
      <>
        <PlayersSearchBar value={searchQuery} onChangeText={setSearchQuery} />
        <FlatList<DiscoverPlayer>
          testID="find-players-list"
          data={players as DiscoverPlayer[]}
          keyExtractor={(item) => String(item.player_id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshingPlayers}
              onRefresh={onRefreshPlayers}
            />
          }
        />
      </>
    );
  };

  return (
    <View testID="find-players-body" className="flex-1">
      {renderContent()}
    </View>
  );
}
