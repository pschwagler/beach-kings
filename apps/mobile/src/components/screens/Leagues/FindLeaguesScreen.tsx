/**
 * FindLeaguesScreen — search and filter public leagues.
 *
 * Features:
 *   Search bar + filter chips (All, Public, Men's, Women's, Coed, Beginner, Intermediate)
 *   League result cards with name, badges, friends-in-league, action buttons
 *   Empty state with Create League CTA
 *
 * Wireframe ref: find-leagues.html
 */

import React from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import TopNav from '@/components/ui/TopNav';
import Avatar from '@/components/ui/Avatar';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import {
  useFindLeaguesScreen,
  type FindLeaguesFilter,
} from './useFindLeaguesScreen';
import type { FindLeagueResult } from '@beach-kings/shared';
import { usePaletteColors } from '@/theme/usePaletteColors';

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface SearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}

function FindLeaguesSearchBar({ value, onChangeText }: SearchBarProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View className="px-4 py-3 bg-surface border-b border-divider">
      <View className="flex-row items-center bg-elevated rounded-[10px] px-[12px] h-[40px] gap-[8px]">
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx="11" cy="11" r="8" stroke={palette.textTertiary} strokeWidth={2} />
          <Path d="M21 21l-4.35-4.35" stroke={palette.textTertiary} strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <TextInput
          testID="find-leagues-search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder="Search leagues…"
          placeholderTextColor={palette.textTertiary}
          className="flex-1 text-[14px] text-default"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          clearButtonMode="while-editing"
          accessibilityLabel="Search leagues"
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

interface FilterChipsProps {
  readonly activeFilter: FindLeaguesFilter;
  readonly onSelect: (f: FindLeaguesFilter) => void;
}

const FILTER_OPTIONS: Array<{ key: FindLeaguesFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'public', label: 'Public' },
  { key: 'mens', label: "Men's" },
  { key: 'womens', label: "Women's" },
  { key: 'coed', label: 'Coed' },
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
];

function FilterChips({ activeFilter, onSelect }: FilterChipsProps): React.ReactNode {
  return (
    <View className="bg-surface border-b border-divider">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
        accessibilityRole="tablist"
      >
        {FILTER_OPTIONS.map(({ key, label }) => {
          const isActive = key === activeFilter;
          return (
            <Pressable
              key={key}
              testID={`filter-chip-${key}`}
              onPress={() => {
                void hapticLight();
                onSelect(key);
              }}
              className={`px-[14px] py-[8px] rounded-full border ${
                isActive
                  ? 'bg-brand-teal border-brand-teal'
                  : 'bg-surface border-strong'
              } active:opacity-70`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                className={`text-[13px] font-semibold ${
                  isActive
                    ? 'text-inverse'
                    : 'text-muted'
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// League result card
// ---------------------------------------------------------------------------

interface LeagueResultCardProps {
  readonly league: FindLeagueResult;
  readonly onPress: (id: number) => void;
  readonly onJoinLeague: (id: number) => Promise<void>;
  readonly isRequesting: boolean;
  readonly joinError: string | null;
}

function genderLabel(g: FindLeagueResult['gender']): string {
  if (g === 'mens') return "Men's";
  if (g === 'womens') return "Women's";
  return 'Coed';
}

function LeagueResultCard({
  league,
  onPress,
  onJoinLeague,
  isRequesting,
  joinError,
}: LeagueResultCardProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View className="mx-4 mb-3 rounded-[12px] border border-divider bg-surface p-4">
      <Pressable
        testID={`league-result-card-${league.id}`}
        onPress={() => {
          void hapticLight();
          onPress(league.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`View ${league.name}`}
        className="active:opacity-80"
      >
        {/* Top row */}
        <View className="flex-row items-start mb-2">
          <View className="flex-1 min-w-0 mr-2">
            <Text
              className="text-[15px] font-bold text-default"
              numberOfLines={2}
            >
              {league.name}
            </Text>
            {league.location_name != null && (
              <Text className="text-[12px] text-muted mt-[2px]">
                {league.location_name}
              </Text>
            )}
          </View>

          {/* Access badge */}
          <View
            className={`rounded-[8px] px-2 py-[3px] ${
              league.access_type === 'open'
                ? 'bg-success-tint'
                : 'bg-warning-tint'
            }`}
          >
            <Text
              className={`text-[11px] font-semibold ${
                league.access_type === 'open'
                  ? 'text-success'
                  : 'text-warning'
              }`}
            >
              {league.access_type === 'open' ? 'Public' : 'Invite Only'}
            </Text>
          </View>
        </View>

        {/* Badge row */}
        <View className="flex-row flex-wrap gap-2 mb-3">
          {league.level != null && (
            <View className="bg-info-tint rounded-[8px] px-2 py-[3px]">
              <Text className="text-[11px] font-semibold text-info">
                {league.level}
              </Text>
            </View>
          )}
          <View className="bg-elevated rounded-[8px] px-2 py-[3px]">
            <Text className="text-[11px] font-semibold text-muted">
              {genderLabel(league.gender)}
            </Text>
          </View>
          <View className="bg-elevated rounded-[8px] px-2 py-[3px]">
            <Text className="text-[11px] text-muted">
              {league.member_count}{' '}
              {league.member_count === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>

        {/* Friends in league */}
        {league.friends_in_league.length > 0 && (
          <View className="flex-row items-center gap-2 mb-3">
            <View className="flex-row">
              {league.friends_in_league.slice(0, 3).map((friend, index) => (
                <View
                  key={friend.player_id}
                  style={{ marginLeft: index > 0 ? -8 : 0 }}
                >
                  <Avatar
                    imageUrl={friend.avatar_url}
                    name={friend.initials}
                    size={24}
                    colorSeed={friend.player_id}
                    className="border-2 border-surface"
                    accessible={false}
                  />
                </View>
              ))}
            </View>
            <Text className="text-[12px] text-muted">
              {league.friends_in_league.length === 1
                ? '1 friend'
                : `${league.friends_in_league.length} friends`}{' '}
              in this league
            </Text>
          </View>
        )}
      </Pressable>

      {/* Action button */}
      {league.user_status === 'member' ? (
        <View
          accessibilityLabel={`You are a member of ${league.name}`}
          className="bg-info-tint rounded-[8px] py-[10px] items-center"
        >
          <Text className="text-[13px] font-semibold text-info">
            You're a Member
          </Text>
        </View>
      ) : league.user_status === 'requested' ? (
        <View
          accessibilityLabel={`Request to join ${league.name} pending`}
          className="bg-warning-tint rounded-[8px] py-[10px] items-center"
        >
          <Text className="text-[13px] font-semibold text-warning">
            Request Pending
          </Text>
        </View>
      ) : (
        <>
          <Pressable
            testID={`request-join-btn-${league.id}`}
            onPress={() => {
              void hapticMedium();
              if (league.access_type === 'open') {
                void onJoinLeague(league.id);
              } else {
                onPress(league.id);
              }
            }}
            disabled={isRequesting}
            accessibilityRole="button"
            accessibilityLabel={
              league.access_type === 'open'
                ? joinError != null
                  ? `Try joining ${league.name} again`
                  : `Join ${league.name}`
                : `View ${league.name}`
            }
            accessibilityState={{
              disabled: isRequesting,
              busy: isRequesting,
            }}
            className="bg-brand-teal rounded-[8px] py-[10px] items-center active:opacity-80"
          >
            {isRequesting ? (
              <ActivityIndicator size="small" color={palette.textInverse} />
            ) : (
              <Text className="text-[13px] font-bold text-inverse">
                {league.access_type === 'open'
                  ? joinError != null
                    ? 'Try Again'
                    : 'Join League'
                  : 'View League'}
              </Text>
            )}
          </Pressable>
          {joinError != null && (
            <Text
              testID={`join-league-error-${league.id}`}
              accessibilityRole="alert"
              className="text-[12px] font-medium text-danger text-center mt-2"
            >
              {joinError}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  readonly onCreateLeague: () => void;
}

function FindLeaguesEmptyState({ onCreateLeague }: EmptyStateProps): React.ReactNode {
  return (
    <View
      testID="find-leagues-empty"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <Text className="text-[18px] font-bold text-default mb-2 text-center">
        No Leagues Found
      </Text>
      <Text className="text-[14px] text-muted text-center leading-[1.5] mb-6">
        Try adjusting your search or filters, or start your own league.
      </Text>
      <Pressable
        testID="empty-create-league-btn"
        onPress={() => {
          void hapticMedium();
          onCreateLeague();
        }}
        className="bg-brand-gold rounded-[10px] px-6 py-[12px] active:opacity-80"
      >
        <Text className="text-[14px] font-bold text-white">Create a League</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function FindLeaguesErrorState({ onRetry }: { readonly onRetry: () => void }): React.ReactNode {
  return (
    <View
      testID="find-leagues-error"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <Text className="text-[16px] font-bold text-default mb-2">
        Something went wrong
      </Text>
      <Pressable
        testID="find-leagues-retry"
        onPress={onRetry}
        className="mt-4 px-5 py-[10px] rounded-[8px] bg-brand-teal active:opacity-80"
      >
        <Text className="text-[14px] font-semibold text-white">Try Again</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function FindLeaguesScreen(): React.ReactNode {
  const {
    searchQuery,
    activeFilter,
    leagues,
    isLoading,
    isRefreshing,
    isError,
    onChangeSearch,
    onSelectFilter,
    onRefresh,
    onRetry,
    onPressLeague,
    onJoinLeague,
    requestingIds,
    joinError,
    onCreateLeague,
  } = useFindLeaguesScreen();

  const renderContent = (): React.ReactNode => {
    if (isLoading && !isRefreshing) {
      return (
        <View testID="find-leagues-loading" className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      );
    }

    if (isError && !isRefreshing) {
      return <FindLeaguesErrorState onRetry={onRetry} />;
    }

    if (leagues.length === 0) {
      return <FindLeaguesEmptyState onCreateLeague={onCreateLeague} />;
    }

    return (
      <FlatList
        testID="find-leagues-list"
        data={leagues}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <LeagueResultCard
            league={item}
            onPress={onPressLeague}
            onJoinLeague={onJoinLeague}
            isRequesting={requestingIds.has(item.id)}
            joinError={
              joinError?.leagueId === item.id ? joinError.message : null
            }
          />
        )}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      />
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Find Leagues" showBack />
      <View testID="find-leagues-screen" className="flex-1 bg-page">
        <FindLeaguesSearchBar value={searchQuery} onChangeText={onChangeSearch} />
        <FilterChips activeFilter={activeFilter} onSelect={onSelectFilter} />
        {renderContent()}
      </View>
    </SafeAreaView>
  );
}
