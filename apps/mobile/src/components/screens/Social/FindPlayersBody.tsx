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
 * tab now, so the old internal Players|Friends tab bar is dropped.
 *
 * Filter chips (Same League / Shared Friends / skill levels) sit under the
 * search bar and drive server-side discover params via the hook's toggle
 * handlers. The chip row stays visible in the loading and empty states so an
 * active filter that empties (or is refetching) the list can still be cleared.
 * Level chips use the app's real SkillLevel values rather than the wireframe's
 * Open/AA/A/B — 'A'/'B' don't exist in the data model.
 *
 * Wireframe ref: find-players.html
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import type { ListRenderItem } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { hapticLight } from '@/utils/haptics';
import PlayerRow from '@/components/screens/FindPlayers/PlayerRow';
import type { DiscoverPlayer } from '@/components/screens/FindPlayers/PlayerRow';
import FindPlayersSkeleton from '@/components/screens/FindPlayers/FindPlayersSkeleton';
import FindPlayersErrorState from '@/components/screens/FindPlayers/FindPlayersErrorState';
import type {
  DiscoverLevel,
  UseDiscoverPlayersResult,
} from '@/components/screens/FindPlayers/useDiscoverPlayers';

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
// Filter chips
// ---------------------------------------------------------------------------

/** Level chips mirror the real SkillLevel values (see header comment). */
const LEVEL_CHIPS: readonly { value: DiscoverLevel; label: string }[] = [
  { value: 'Open', label: 'Open' },
  { value: 'AA', label: 'AA' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'beginner', label: 'Beginner' },
];

interface FilterChipProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

function FilterChip({
  label,
  active,
  onPress,
  testID,
}: FilterChipProps): React.ReactNode {
  const handlePress = useCallback(() => {
    void hapticLight();
    onPress();
  }, [onPress]);

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Filter by ${label}`}
      className={
        active
          ? 'px-[14px] rounded-[20px] border-[1.5px] border-brand-teal bg-brand-teal min-h-[44px] justify-center active:opacity-80'
          : 'px-[14px] rounded-[20px] border-[1.5px] border-divider bg-surface min-h-[44px] justify-center active:opacity-70'
      }
    >
      <Text
        className={
          active
            ? 'text-[12px] font-semibold text-white'
            : 'text-[12px] font-semibold text-muted'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface FilterChipsRowProps {
  readonly levelFilter: DiscoverLevel | null;
  readonly sameLeagueOnly: boolean;
  readonly sharedFriendsOnly: boolean;
  readonly onToggleLevel: (level: DiscoverLevel) => void;
  readonly onToggleSameLeague: () => void;
  readonly onToggleSharedFriends: () => void;
}

function FilterChipsRow({
  levelFilter,
  sameLeagueOnly,
  sharedFriendsOnly,
  onToggleLevel,
  onToggleSameLeague,
  onToggleSharedFriends,
}: FilterChipsRowProps): React.ReactNode {
  return (
    <View className="bg-surface border-b border-divider">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <FilterChip
          testID="discover-chip-same-league"
          label="Same League"
          active={sameLeagueOnly}
          onPress={onToggleSameLeague}
        />
        <FilterChip
          testID="discover-chip-shared-friends"
          label="Shared Friends"
          active={sharedFriendsOnly}
          onPress={onToggleSharedFriends}
        />
        {LEVEL_CHIPS.map((chip) => (
          <FilterChip
            key={chip.value}
            testID={`discover-chip-level-${chip.value}`}
            label={chip.label}
            active={levelFilter === chip.value}
            onPress={() => onToggleLevel(chip.value)}
          />
        ))}
      </ScrollView>
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
  readonly scrollRequest?: number;
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
  levelFilter,
  sameLeagueOnly,
  sharedFriendsOnly,
  onToggleLevel,
  onToggleSameLeague,
  onToggleSharedFriends,
  scrollRequest = 0,
}: FindPlayersBodyProps): React.ReactNode {
  const listRef = useRef<FlatList<DiscoverPlayer>>(null);

  useEffect(() => {
    if (scrollRequest > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [scrollRequest]);

  const filterChips = (
    <FilterChipsRow
      levelFilter={levelFilter}
      sameLeagueOnly={sameLeagueOnly}
      sharedFriendsOnly={sharedFriendsOnly}
      onToggleLevel={onToggleLevel}
      onToggleSameLeague={onToggleSameLeague}
      onToggleSharedFriends={onToggleSharedFriends}
    />
  );

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
          {filterChips}
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
          {filterChips}
          <PlayersEmptyState isSearching={searchQuery.trim() !== ''} />
        </>
      );
    }

    return (
      <>
        <PlayersSearchBar value={searchQuery} onChangeText={setSearchQuery} />
        {filterChips}
        <FlatList<DiscoverPlayer>
          ref={listRef}
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
