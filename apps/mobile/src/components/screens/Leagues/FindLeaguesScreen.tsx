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
import AppText from '@/components/ui/AppText';
import {
  View,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
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
import FilterChipBar from '@/components/ui/FilterChipBar';

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

const FILTER_OPTIONS = [
  { value: 'all', label: 'All', testID: 'filter-chip-all' },
  { value: 'public', label: 'Public', testID: 'filter-chip-public' },
  { value: 'mens', label: "Men's", testID: 'filter-chip-mens' },
  { value: 'womens', label: "Women's", testID: 'filter-chip-womens' },
  { value: 'coed', label: 'Coed', testID: 'filter-chip-coed' },
  { value: 'beginner', label: 'Beginner', testID: 'filter-chip-beginner' },
  { value: 'intermediate', label: 'Intermediate', testID: 'filter-chip-intermediate' },
] as const satisfies readonly { value: FindLeaguesFilter; label: string; testID: string }[];

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
        accessibilityHint="Opens league details"
        className="active:opacity-80"
      >
        {/* Top row */}
        <View className="flex-row items-start mb-2">
          <View className="flex-1 min-w-0 mr-2">
            <AppText
              className="text-[15px] font-bold text-default"
              numberOfLines={2}
            >
              {league.name}
            </AppText>
            {league.location_name != null && (
              <AppText className="text-[12px] text-muted mt-[2px]">
                {league.location_name}
              </AppText>
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
            <AppText
              className={`text-[11px] font-semibold ${
                league.access_type === 'open'
                  ? 'text-success'
                  : 'text-warning'
              }`}
            >
              {league.access_type === 'open' ? 'Public' : 'Invite Only'}
            </AppText>
          </View>
        </View>

        {/* Badge row */}
        <View className="flex-row flex-wrap gap-2 mb-3">
          {league.level != null && (
            <View className="bg-info-tint rounded-[8px] px-2 py-[3px]">
              <AppText className="text-[11px] font-semibold text-info">
                {league.level}
              </AppText>
            </View>
          )}
          <View className="bg-elevated rounded-[8px] px-2 py-[3px]">
            <AppText className="text-[11px] font-semibold text-muted">
              {genderLabel(league.gender)}
            </AppText>
          </View>
          <View className="bg-elevated rounded-[8px] px-2 py-[3px]">
            <AppText className="text-[11px] text-muted">
              {league.member_count}{' '}
              {league.member_count === 1 ? 'member' : 'members'}
            </AppText>
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
            <AppText className="text-[12px] text-muted">
              {league.friends_in_league.length === 1
                ? '1 friend'
                : `${league.friends_in_league.length} friends`}{' '}
              in this league
            </AppText>
          </View>
        )}
      </Pressable>

      {/* Action button */}
      {league.user_status === 'member' ? (
        <View
          accessibilityLabel={`You are a member of ${league.name}`}
          className="bg-info-tint rounded-[8px] py-[10px] items-center"
        >
          <AppText className="text-[13px] font-semibold text-info">
            You're a Member
          </AppText>
        </View>
      ) : league.user_status === 'requested' ? (
        <View
          accessibilityLabel={`Request to join ${league.name} pending`}
          className="bg-warning-tint rounded-[8px] py-[10px] items-center"
        >
          <AppText className="text-[13px] font-semibold text-warning">
            Request Pending
          </AppText>
        </View>
      ) : league.access_type === 'open' ? (
        <>
          <Pressable
            testID={`request-join-btn-${league.id}`}
            onPress={() => {
              void hapticMedium();
              void onJoinLeague(league.id);
            }}
            disabled={isRequesting}
            accessibilityRole="button"
            accessibilityLabel={
              joinError != null
                ? `Try joining ${league.name} again`
                : `Join ${league.name}`
            }
            accessibilityHint="Joins this open league"
            accessibilityState={{
              disabled: isRequesting,
              busy: isRequesting,
            }}
            className="bg-brand-teal rounded-[8px] py-[10px] items-center active:opacity-80"
          >
            {isRequesting ? (
              <ActivityIndicator size="small" color={palette.onBrandTeal} />
            ) : (
              <AppText className="text-[13px] font-bold text-on-brand-teal">
                {joinError != null ? 'Try Again' : 'Join League'}
              </AppText>
            )}
          </Pressable>
          {joinError != null && (
            <AppText
              testID={`join-league-error-${league.id}`}
              accessibilityRole="alert"
              className="text-[12px] font-medium text-danger text-center mt-2"
            >
              {joinError}
            </AppText>
          )}
        </>
      ) : null}
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
      <AppText className="text-[18px] font-bold text-default mb-2 text-center">
        No Leagues Found
      </AppText>
      <AppText className="text-[14px] text-muted text-center leading-[1.5] mb-6">
        Try adjusting your search or filters, or start your own league.
      </AppText>
      <Pressable
        testID="empty-create-league-btn"
        onPress={() => {
          void hapticMedium();
          onCreateLeague();
        }}
        className="bg-brand-gold rounded-[10px] px-6 py-[12px] active:opacity-80"
      >
        <AppText className="text-[14px] font-bold text-on-brand-gold">Create a League</AppText>
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
      <AppText className="text-[16px] font-bold text-default mb-2">
        Something went wrong
      </AppText>
      <Pressable
        testID="find-leagues-retry"
        onPress={onRetry}
        className="mt-4 px-5 py-[10px] rounded-[8px] bg-brand-teal active:opacity-80"
      >
        <AppText className="text-[14px] font-semibold text-on-brand-teal">Try Again</AppText>
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
        <View className="bg-surface border-b border-divider py-2">
          <FilterChipBar
            items={FILTER_OPTIONS}
            value={activeFilter}
            onValueChange={(value) => {
              void hapticLight();
              onSelectFilter(value);
            }}
            accessibilityLabel="League filters"
          />
        </View>
        {renderContent()}
      </View>
    </SafeAreaView>
  );
}
