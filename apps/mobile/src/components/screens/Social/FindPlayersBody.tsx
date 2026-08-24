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
  FlatList,
  Pressable,
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
import AppText from '@/components/ui/AppText';
import { BottomSheetSelect, type SelectOption } from '@/components/forms';
import type {
  DiscoverLevel,
  UseDiscoverPlayersResult,
} from '@/components/screens/FindPlayers/useDiscoverPlayers';
import {
  DISCOVERY_RADII,
  formatMetroLabel,
  type DiscoverRadius,
} from '@/components/screens/FindPlayers/discoveryLocation';
import type { Location } from '@beach-kings/shared';

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

/** Level chips mirror the real SkillLevel values (see header comment). */
const LEVEL_CHIPS: readonly { value: DiscoverLevel; label: string }[] = [
  { value: 'Open', label: 'Open' },
  { value: 'AA', label: 'AA' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'beginner', label: 'Beginner' },
];

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
  type ConnectionFilter = 'any' | 'same-league' | 'shared-friends';
  type LevelFilter = 'any' | DiscoverLevel;
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
      <FilterChipBar<LevelFilter>
        testID="discover-level-filters"
        accessibilityLabel="Player level filters"
        items={[
          { value: 'any', label: 'Any Level', testID: 'discover-chip-level-any' },
          ...LEVEL_CHIPS.map((chip) => ({
            value: chip.value,
            label: chip.label,
            testID: `discover-chip-level-${chip.value}`,
          })),
        ]}
        value={levelFilter ?? 'any'}
        onValueChange={(next) => {
          void hapticLight();
          if (next === 'any') {
            if (levelFilter != null) onToggleLevel(levelFilter);
            return;
          }
          onToggleLevel(next);
        }}
      />
    </View>
  );
}

interface LocationFilterControlsProps {
  readonly locations: readonly Location[];
  readonly locationsPending: boolean;
  readonly locationsError: Error | null;
  readonly onRetryLocations: () => void;
  readonly metroFilterId: string | null;
  readonly nearMeEnabled: boolean;
  readonly nearMePending: boolean;
  readonly nearMeDenied: boolean;
  readonly nearMeUnavailable: boolean;
  readonly nearMeOriginLabel: string | null;
  readonly radiusMiles: DiscoverRadius;
  readonly onSelectMetro: (locationId: string | null) => void;
  readonly onSelectNearMe: () => void;
  readonly onSetRadius: (radius: DiscoverRadius) => void;
  readonly onClearLocation: () => void;
}

function LocationFilterControls({
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
}: LocationFilterControlsProps): React.ReactNode {
  const options: readonly SelectOption[] = [
    { value: '', label: 'All metros' },
    ...locations.map((location) => ({
      value: location.id,
      label: formatMetroLabel(location),
      searchText: [location.name, location.city, location.state]
        .filter(Boolean)
        .join(' '),
    })),
  ];

  return (
    <View
      testID="discover-location-controls"
      className="gap-2 border-b border-divider bg-surface px-4 py-3"
    >
      <AppText accessibilityRole="header" className="text-caption font-bold text-default">
        Location
      </AppText>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <BottomSheetSelect
            title="Choose a metro"
            placeholder={locationsPending ? 'Loading metros…' : 'All metros'}
            options={options}
            value={metroFilterId ?? ''}
            onChange={(value) => onSelectMetro(value || null)}
            loading={locationsPending}
            disabled={locationsPending}
            searchable
            searchPlaceholder="Search metros"
            testID="discover-metro-select"
          />
        </View>
        <Pressable
          testID="discover-near-me"
          accessibilityRole="button"
          accessibilityLabel={nearMeEnabled ? 'Clear Near Me filter' : 'Filter players Near Me'}
          accessibilityHint="Requests device location only when selected"
          accessibilityState={{ selected: nearMeEnabled }}
          onPress={nearMeEnabled ? onClearLocation : onSelectNearMe}
          className={`min-h-touch justify-center rounded-full border px-4 ${
            nearMeEnabled
              ? 'border-brand-teal bg-brand-teal'
              : 'border-divider bg-surface'
          }`}
        >
          <AppText
            className={`text-caption font-semibold ${
              nearMeEnabled ? 'text-on-brand-teal' : 'text-default'
            }`}
          >
            Near Me
          </AppText>
        </Pressable>
      </View>

      {locationsError != null && (
        <View className="flex-row flex-wrap items-center gap-2">
          <AppText className="text-caption text-danger">Metros could not be loaded.</AppText>
          <Pressable
            testID="discover-location-retry"
            accessibilityRole="button"
            accessibilityLabel="Retry metro list"
            onPress={onRetryLocations}
            className="min-h-touch justify-center"
          >
            <AppText className="text-caption font-bold text-brand-teal">Retry</AppText>
          </Pressable>
        </View>
      )}

      {nearMePending && (
        <AppText accessibilityLiveRegion="polite" className="text-caption text-muted">
          Finding your nearest metro…
        </AppText>
      )}
      {nearMeDenied && (
        <AppText accessibilityLiveRegion="polite" className="text-caption text-danger">
          Location is unavailable. Choose a metro to keep filtering.
        </AppText>
      )}
      {nearMeUnavailable && (
        <AppText accessibilityLiveRegion="polite" className="text-caption text-danger">
          Nearby search is unavailable. Retry metros or choose a metro.
        </AppText>
      )}
      {nearMeEnabled && nearMeOriginLabel != null && (
        <View className="gap-2">
          <AppText accessibilityLiveRegion="polite" className="text-caption text-muted">
            Near {nearMeOriginLabel}
          </AppText>
          <FilterChipBar<`${DiscoverRadius}`>
            testID="discover-radius-filters"
            accessibilityLabel="Distance radius"
            items={DISCOVERY_RADII.map((radius) => ({
              value: String(radius) as `${DiscoverRadius}`,
              label: `${radius} mi`,
              testID: `discover-radius-${radius}`,
            }))}
            value={String(radiusMiles) as `${DiscoverRadius}`}
            onValueChange={(radius) => onSetRadius(Number(radius) as DiscoverRadius)}
          />
        </View>
      )}
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
  onToggleLevel,
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
        levelFilter={levelFilter}
        sameLeagueOnly={sameLeagueOnly}
        sharedFriendsOnly={sharedFriendsOnly}
        onToggleLevel={onToggleLevel}
        onToggleSameLeague={onToggleSameLeague}
        onToggleSharedFriends={onToggleSharedFriends}
      />
      <LocationFilterControls
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
