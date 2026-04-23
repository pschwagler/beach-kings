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
import { hapticLight, hapticMedium } from '@/utils/haptics';
import {
  useFindLeaguesScreen,
  type FindLeaguesFilter,
} from './useFindLeaguesScreen';
import type { FindLeagueResult } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface SearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}

function FindLeaguesSearchBar({ value, onChangeText }: SearchBarProps): React.ReactNode {
  return (
    <View className="px-4 py-3 bg-white dark:bg-dark-surface border-b border-[#f0f0f0] dark:border-border-strong">
      <View className="flex-row items-center bg-[#f5f5f5] dark:bg-dark-elevated rounded-[10px] px-[12px] h-[40px] gap-[8px]">
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Circle cx="11" cy="11" r="8" stroke="#999" strokeWidth={2} />
          <Path d="M21 21l-4.35-4.35" stroke="#999" strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <TextInput
          testID="find-leagues-search-input"
          value={value}
          onChangeText={onChangeText}
          placeholder="Search leagues…"
          placeholderTextColor="#999"
          className="flex-1 text-[14px] text-text-default dark:text-content-primary"
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
    <View className="bg-white dark:bg-dark-surface border-b border-[#f0f0f0] dark:border-border-strong">
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
                  ? 'bg-[#1a3a4a] dark:bg-brand-teal border-[#1a3a4a] dark:border-brand-teal'
                  : 'bg-white dark:bg-dark-surface border-[#ddd] dark:border-border-strong'
              } active:opacity-70`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                className={`text-[13px] font-semibold ${
                  isActive
                    ? 'text-white'
                    : 'text-text-secondary dark:text-content-secondary'
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
  readonly onRequestJoin: (id: number) => Promise<void>;
  readonly isRequesting: boolean;
}

function genderLabel(g: FindLeagueResult['gender']): string {
  if (g === 'mens') return "Men's";
  if (g === 'womens') return "Women's";
  return 'Coed';
}

function LeagueResultCard({
  league,
  onPress,
  onRequestJoin,
  isRequesting,
}: LeagueResultCardProps): React.ReactNode {
  return (
    <Pressable
      testID={`league-result-card-${league.id}`}
      onPress={() => {
        void hapticLight();
        onPress(league.id);
      }}
      className="bg-white dark:bg-dark-surface mx-4 mb-3 rounded-[12px] border border-[#e8e8e8] dark:border-border-subtle p-4 active:opacity-80"
    >
      {/* Top row */}
      <View className="flex-row items-start mb-2">
        <View className="flex-1 min-w-0 mr-2">
          <Text
            className="text-[15px] font-bold text-text-default dark:text-content-primary"
            numberOfLines={2}
          >
            {league.name}
          </Text>
          {league.location_name != null && (
            <Text className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]">
              {league.location_name}
            </Text>
          )}
        </View>

        {/* Access badge */}
        <View
          className={`rounded-[8px] px-2 py-[3px] ${
            league.access_type === 'open'
              ? 'bg-green-100 dark:bg-green-900/30'
              : 'bg-yellow-100 dark:bg-yellow-900/30'
          }`}
        >
          <Text
            className={`text-[11px] font-semibold ${
              league.access_type === 'open'
                ? 'text-green-700 dark:text-green-400'
                : 'text-yellow-700 dark:text-yellow-400'
            }`}
          >
            {league.access_type === 'open' ? 'Public' : 'Invite Only'}
          </Text>
        </View>
      </View>

      {/* Badge row */}
      <View className="flex-row flex-wrap gap-2 mb-3">
        {league.level != null && (
          <View className="bg-[#e8f4f8] dark:bg-teal-900/40 rounded-[8px] px-2 py-[3px]">
            <Text className="text-[11px] font-semibold text-[#2a7d9c] dark:text-teal-300">
              {league.level}
            </Text>
          </View>
        )}
        <View className="bg-[#f0f0f0] dark:bg-dark-elevated rounded-[8px] px-2 py-[3px]">
          <Text className="text-[11px] font-semibold text-text-secondary dark:text-content-secondary">
            {genderLabel(league.gender)}
          </Text>
        </View>
        <View className="bg-[#f0f0f0] dark:bg-dark-elevated rounded-[8px] px-2 py-[3px]">
          <Text className="text-[11px] text-text-secondary dark:text-content-secondary">
            {league.member_count} {league.member_count === 1 ? 'member' : 'members'}
          </Text>
        </View>
      </View>

      {/* Friends in league */}
      {league.friends_in_league.length > 0 && (
        <View className="flex-row items-center gap-2 mb-3">
          <View className="flex-row">
            {league.friends_in_league.slice(0, 3).map((f, idx) => (
              <View
                key={f.player_id}
                className="w-6 h-6 rounded-full bg-[#1a3a4a] dark:bg-brand-teal items-center justify-center border-2 border-white dark:border-dark-surface"
                style={{ marginLeft: idx > 0 ? -8 : 0 }}
              >
                <Text className="text-[8px] font-bold text-white">{f.initials}</Text>
              </View>
            ))}
          </View>
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
            {league.friends_in_league.length === 1
              ? '1 friend'
              : `${league.friends_in_league.length} friends`}{' '}
            in this league
          </Text>
        </View>
      )}

      {/* Action button */}
      {league.user_status === 'member' ? (
        <View className="bg-[#e8f4f8] dark:bg-teal-900/30 rounded-[8px] py-[10px] items-center">
          <Text className="text-[13px] font-semibold text-[#2a7d9c] dark:text-teal-300">
            You're a Member
          </Text>
        </View>
      ) : league.user_status === 'requested' ? (
        <View className="bg-yellow-50 dark:bg-yellow-900/20 rounded-[8px] py-[10px] items-center">
          <Text className="text-[13px] font-semibold text-yellow-700 dark:text-yellow-400">
            Request Pending
          </Text>
        </View>
      ) : (
        <Pressable
          testID={`request-join-btn-${league.id}`}
          onPress={() => {
            void hapticMedium();
            void onRequestJoin(league.id);
          }}
          disabled={isRequesting}
          className="bg-[#1a3a4a] dark:bg-brand-teal rounded-[8px] py-[10px] items-center active:opacity-80"
        >
          {isRequesting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-[13px] font-bold text-white">
              {league.access_type === 'open' ? 'Request to Join' : 'View League'}
            </Text>
          )}
        </Pressable>
      )}
    </Pressable>
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
      <Text className="text-[18px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
        No Leagues Found
      </Text>
      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.5] mb-6">
        Try adjusting your search or filters, or start your own league.
      </Text>
      <Pressable
        testID="empty-create-league-btn"
        onPress={() => {
          void hapticMedium();
          onCreateLeague();
        }}
        className="bg-[#c8a84b] rounded-[10px] px-6 py-[12px] active:opacity-80"
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
      <Text className="text-[16px] font-bold text-text-default dark:text-content-primary mb-2">
        Something went wrong
      </Text>
      <Pressable
        testID="find-leagues-retry"
        onPress={onRetry}
        className="mt-4 px-5 py-[10px] rounded-[8px] bg-[#1a3a4a] dark:bg-brand-teal active:opacity-80"
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
    onRequestJoin,
    requestingIds,
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
            onRequestJoin={onRequestJoin}
            isRequesting={requestingIds.has(item.id)}
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
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Find Leagues" showBack />
      <View testID="find-leagues-screen" className="flex-1 bg-[#f5f5f5] dark:bg-base">
        <FindLeaguesSearchBar value={searchQuery} onChangeText={onChangeSearch} />
        <FilterChips activeFilter={activeFilter} onSelect={onSelectFilter} />
        {renderContent()}
      </View>
    </SafeAreaView>
  );
}
