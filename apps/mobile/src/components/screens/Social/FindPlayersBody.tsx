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
 * The primary relationship views stay inline. Level and location refinements
 * live in one draft-based Filter sheet and commit only when Apply is pressed.
 * Both controls remain available in loading, error, and empty states.
 *
 * Wireframe ref: find-players.html
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  TextInput,
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
import FilterChipBar from '@/components/ui/FilterChipBar';
import EmptyState from '@/components/ui/EmptyState';
import type {
  UseDiscoverPlayersResult,
} from '@/components/screens/FindPlayers/useDiscoverPlayers';
import DiscoveryFilterPanel from './DiscoveryFilterPanel';

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
      <View className="flex-row items-center bg-elevated rounded-[10px] px-[12px] min-h-touch gap-[8px]">
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

interface FilterChipsRowProps {
  readonly sameLeagueOnly: boolean;
  readonly sharedFriendsOnly: boolean;
  readonly onToggleSameLeague: () => void;
  readonly onToggleSharedFriends: () => void;
}

function FilterChipsRow({
  sameLeagueOnly,
  sharedFriendsOnly,
  onToggleSameLeague,
  onToggleSharedFriends,
}: FilterChipsRowProps): React.ReactNode {
  type ConnectionFilter = 'any' | 'same-league' | 'shared-friends';
  const connectionValue: ConnectionFilter = sameLeagueOnly
    ? 'same-league'
    : sharedFriendsOnly
      ? 'shared-friends'
      : 'any';

  const changeConnection = (next: ConnectionFilter) => {
    void hapticLight();
    if (sameLeagueOnly && next !== 'same-league') onToggleSameLeague();
    if (sharedFriendsOnly && next !== 'shared-friends') onToggleSharedFriends();
    if (next === 'same-league' && !sameLeagueOnly) onToggleSameLeague();
    if (next === 'shared-friends' && !sharedFriendsOnly) onToggleSharedFriends();
  };

  return (
    <View className="bg-surface border-b border-divider gap-2 py-2">
      <FilterChipBar<ConnectionFilter>
        testID="discover-connection-filters"
        accessibilityLabel="Player connection filters"
        items={[
          { value: 'any', label: 'All Players', testID: 'discover-chip-all-players' },
          { value: 'same-league', label: 'Same League', testID: 'discover-chip-same-league' },
          { value: 'shared-friends', label: 'Shared Friends', testID: 'discover-chip-shared-friends' },
        ]}
        value={connectionValue}
        onValueChange={changeConnection}
      />
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
    <EmptyState
      testID="find-players-empty-state"
      title="No Players Found"
      description={
        isSearching
          ? 'Try adjusting your search or filters to discover more players.'
          : 'Check back soon — new players join all the time.'
      }
    />
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
  onSetLevel,
  onToggleSameLeague,
  onToggleSharedFriends,
  locations,
  locationsPending,
  locationsError,
  onRetryLocations,
  metroFilterId,
  nearMeEnabled,
  nearMePending,
  nearMeDenied,
  nearMeUnavailable,
  nearMeOriginLabel,
  radiusMiles,
  onSelectMetro,
  onSelectNearMe,
  onSetRadius,
  onClearLocation,
  hasLocationFilter,
  scrollRequest = 0,
}: FindPlayersBodyProps): React.ReactNode {
  const listRef = useRef<FlatList<DiscoverPlayer>>(null);

  useEffect(() => {
    if (scrollRequest > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [scrollRequest]);

  const filterChips = (
    <>
      <FilterChipsRow
        sameLeagueOnly={sameLeagueOnly}
        sharedFriendsOnly={sharedFriendsOnly}
        onToggleSameLeague={onToggleSameLeague}
        onToggleSharedFriends={onToggleSharedFriends}
      />
      <DiscoveryFilterPanel
        levelFilter={levelFilter}
        onSetLevel={onSetLevel}
        locations={locations}
        locationsPending={locationsPending}
        locationsError={locationsError}
        onRetryLocations={onRetryLocations}
        metroFilterId={metroFilterId}
        nearMeEnabled={nearMeEnabled}
        nearMePending={nearMePending}
        nearMeDenied={nearMeDenied}
        nearMeUnavailable={nearMeUnavailable}
        nearMeOriginLabel={nearMeOriginLabel}
        radiusMiles={radiusMiles}
        onSelectMetro={onSelectMetro}
        onSelectNearMe={onSelectNearMe}
        onSetRadius={onSetRadius}
        onClearLocation={onClearLocation}
      />
    </>
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
    const searchAndFilters = (
      <>
        <PlayersSearchBar value={searchQuery} onChangeText={setSearchQuery} />
        {filterChips}
      </>
    );

    if (nearMePending) {
      return (
        <>
          {searchAndFilters}
          <EmptyState
            testID="find-players-near-me-resolving"
            title="Finding Nearby Players"
            description="Your results will update after we find the nearest metro."
          />
        </>
      );
    }

    if (nearMeDenied) {
      return (
        <>
          {searchAndFilters}
          <EmptyState
            testID="find-players-near-me-denied"
            title="Location Needed"
            description="Choose a metro or clear Near Me to continue."
          />
        </>
      );
    }

    if (nearMeUnavailable) {
      return (
        <>
          {searchAndFilters}
          <EmptyState
            testID="find-players-near-me-unavailable"
            title="Nearby Search Unavailable"
            description="Retry the metro list, choose a metro, or clear Near Me."
          />
        </>
      );
    }

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
      return (
        <>
          <PlayersSearchBar value={searchQuery} onChangeText={setSearchQuery} />
          {filterChips}
          <FindPlayersErrorState onRetry={onRetryPlayers} />
        </>
      );
    }

    if (players.length === 0) {
      return (
        <>
          <PlayersSearchBar value={searchQuery} onChangeText={setSearchQuery} />
          {filterChips}
          <PlayersEmptyState
            isSearching={
              searchQuery.trim() !== ''
              || levelFilter != null
              || sameLeagueOnly
              || sharedFriendsOnly
              || hasLocationFilter
            }
          />
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
