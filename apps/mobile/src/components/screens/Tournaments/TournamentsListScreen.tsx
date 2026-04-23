/**
 * TournamentsListScreen — top-level tournaments discovery view.
 *
 * Sections (conditional):
 *   - Active Now (live card with pulsing dot)
 *   - My Upcoming (list of upcoming cards, or empty state)
 *   - Nearby (with filter chips)
 *   - Past Tournaments
 *   - Create CTA
 *
 * Wireframe ref: tournaments.html
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import TournamentListSkeleton from './TournamentListSkeleton';
import { ActiveCard, ListCard, PastCard, CreateCTA } from './TournamentCard';
import { useTournamentsListScreen } from './useTournamentsListScreen';
import type { TournamentFilter } from './useTournamentsListScreen';

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

const FILTER_OPTIONS: { key: TournamentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'kob', label: 'KoB' },
  { key: 'bracket', label: 'Bracket' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'open_spots', label: 'Open Spots' },
];

interface FilterChipsProps {
  readonly selected: TournamentFilter;
  readonly onChange: (f: TournamentFilter) => void;
}

function FilterChips({ selected, onChange }: FilterChipsProps): React.ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {FILTER_OPTIONS.map(({ key, label }) => {
        const isActive = selected === key;
        return (
          <TouchableOpacity
            key={key}
            testID={`tournament-filter-${key}`}
            onPress={() => onChange(key)}
            className={`px-[14px] py-[6px] rounded-[20px] border ${
              isActive
                ? 'border-[#1a3a4a] bg-[#1a3a4a]'
                : 'border-[#ddd] dark:border-[#333] bg-white dark:bg-[#1a1a1a]'
            }`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive ? 'text-white' : 'text-text-secondary dark:text-content-secondary'
              }`}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Empty upcoming state
// ---------------------------------------------------------------------------

function UpcomingEmptyState(): React.ReactNode {
  return (
    <View
      testID="tournaments-upcoming-empty"
      className="bg-white dark:bg-[#1a1a1a] rounded-[12px] border border-[#eee] dark:border-[#2a2a2a] p-[20px] items-center"
    >
      <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary mb-[4px]">
        No Upcoming Tournaments
      </Text>
      <Text className="text-[12px] text-text-secondary dark:text-content-secondary text-center">
        Browse nearby tournaments or create your own.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  readonly onRetry: () => void;
}

function TournamentsErrorState({ onRetry }: ErrorStateProps): React.ReactNode {
  return (
    <View
      testID="tournaments-error"
      className="flex-1 items-center justify-center px-[24px] gap-[16px]"
    >
      <Text className="text-[16px] font-semibold text-text-default dark:text-content-primary text-center">
        Could not load tournaments
      </Text>
      <TouchableOpacity
        testID="tournaments-retry-btn"
        onPress={onRetry}
        className="bg-[#1a3a4a] px-[24px] py-[12px] rounded-[10px]"
      >
        <Text className="text-white text-[14px] font-semibold">Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function TournamentsListScreen(): React.ReactNode {
  const {
    activeTournament,
    upcomingTournaments,
    nearbyTournaments,
    pastTournaments,
    filter,
    isLoading,
    error,
    isRefreshing,
    setFilter,
    onRefresh,
    onRetry,
    onTournamentPress,
    onCreatePress,
  } = useTournamentsListScreen();

  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="tournaments-screen"
      >
        <TopNav
          title="Tournaments"
          showBack
          rightAction={
            <TouchableOpacity
              onPress={onCreatePress}
              testID="tournaments-create-btn"
              className="px-[12px] py-[6px]"
            >
              <Text className="text-[14px] font-semibold text-[#d4a843]">+ New</Text>
            </TouchableOpacity>
          }
        />
        <TournamentListSkeleton />
      </SafeAreaView>
    );
  }

  if (error != null && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="tournaments-screen"
      >
        <TopNav title="Tournaments" showBack />
        <TournamentsErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="tournaments-screen"
    >
      <TopNav
        title="Tournaments"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={onCreatePress}
            testID="tournaments-create-btn"
            className="px-[12px] py-[6px]"
          >
            <Text className="text-[14px] font-semibold text-[#d4a843]">+ New</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        testID="tournaments-scroll"
      >
        {/* Active Now */}
        {activeTournament != null && (
          <View className="px-[16px] pt-[16px]">
            <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px]">
              Active Now
            </Text>
            <ActiveCard
              tournament={activeTournament}
              onPress={() => onTournamentPress(activeTournament.id)}
            />
          </View>
        )}

        {/* My Upcoming */}
        <View className="px-[16px] pt-[16px]">
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px]">
            My Upcoming
          </Text>
          {upcomingTournaments.length === 0 ? (
            <UpcomingEmptyState />
          ) : (
            upcomingTournaments.map((t) => (
              <ListCard key={t.id} tournament={t} onPress={() => onTournamentPress(t.id)} />
            ))
          )}
        </View>

        {/* Nearby section with filter chips */}
        <View className="pt-[16px]">
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px] px-[16px]">
            Nearby
          </Text>
          <FilterChips selected={filter} onChange={setFilter} />
          <View className="px-[16px] mt-[10px]">
            {nearbyTournaments.length === 0 ? (
              <Text
                testID="tournaments-nearby-empty"
                className="text-[14px] text-text-secondary dark:text-content-secondary text-center py-[20px]"
              >
                No tournaments found nearby.
              </Text>
            ) : (
              nearbyTournaments.map((t) => (
                <ListCard key={t.id} tournament={t} onPress={() => onTournamentPress(t.id)} />
              ))
            )}
          </View>
        </View>

        {/* Past Tournaments */}
        {pastTournaments.length > 0 && (
          <View className="px-[16px] pt-[16px]">
            <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px]">
              Past Tournaments
            </Text>
            {pastTournaments.map((t) => (
              <PastCard key={t.id} tournament={t} onPress={() => onTournamentPress(t.id)} />
            ))}
          </View>
        )}

        {/* Create CTA */}
        <View className="px-[16px] pt-[8px]">
          <CreateCTA onPress={onCreatePress} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
