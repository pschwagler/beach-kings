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
import AppText from '@/components/ui/AppText';
import {
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import FilterChipBar from '@/components/ui/FilterChipBar';
import TournamentListSkeleton from './TournamentListSkeleton';
import { ActiveCard, ListCard, PastCard, CreateCTA } from './TournamentCard';
import { useTournamentsListScreen } from './useTournamentsListScreen';
import type { TournamentFilter } from './useTournamentsListScreen';

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

const FILTER_OPTIONS = [
  { value: 'all', label: 'All', testID: 'tournament-filter-all' },
  { value: 'kob', label: 'KoB', testID: 'tournament-filter-kob' },
  { value: 'bracket', label: 'Bracket', testID: 'tournament-filter-bracket' },
  { value: 'this_week', label: 'This Week', testID: 'tournament-filter-this_week' },
  { value: 'this_month', label: 'This Month', testID: 'tournament-filter-this_month' },
  { value: 'open_spots', label: 'Open Spots', testID: 'tournament-filter-open_spots' },
] as const satisfies readonly { value: TournamentFilter; label: string; testID: string }[];

// ---------------------------------------------------------------------------
// Empty upcoming state
// ---------------------------------------------------------------------------

function UpcomingEmptyState(): React.ReactNode {
  return (
    <View
      testID="tournaments-upcoming-empty"
      className="bg-surface rounded-[12px] border border-divider p-[20px] items-center"
    >
      <AppText className="text-[14px] font-semibold text-default mb-[4px]">
        No Upcoming Tournaments
      </AppText>
      <AppText className="text-[12px] text-muted text-center">
        Browse nearby tournaments or create your own.
      </AppText>
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
      <AppText className="text-[16px] font-semibold text-default text-center">
        Could not load tournaments
      </AppText>
      <TouchableOpacity
        testID="tournaments-retry-btn"
        onPress={onRetry}
        className="bg-brand-teal px-[24px] py-[12px] rounded-[10px]"
      >
        <AppText className="text-on-brand-teal text-[14px] font-semibold">Retry</AppText>
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
        className="flex-1 bg-page"
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
              <AppText className="text-[14px] font-semibold text-brand-gold">+ New</AppText>
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
        className="flex-1 bg-page"
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
      className="flex-1 bg-page"
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
            <AppText className="text-[14px] font-semibold text-brand-gold">+ New</AppText>
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
            <AppText className="text-[15px] font-bold text-default mb-[10px]">
              Active Now
            </AppText>
            <ActiveCard
              tournament={activeTournament}
              onPress={() => onTournamentPress(activeTournament.id)}
            />
          </View>
        )}

        {/* My Upcoming */}
        <View className="px-[16px] pt-[16px]">
          <AppText className="text-[15px] font-bold text-default mb-[10px]">
            My Upcoming
          </AppText>
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
          <AppText className="text-[15px] font-bold text-default mb-[10px] px-[16px]">
            Nearby
          </AppText>
          <FilterChipBar
            items={FILTER_OPTIONS}
            value={filter}
            onValueChange={setFilter}
            accessibilityLabel="Tournament filters"
          />
          <View className="px-[16px] mt-[10px]">
            {nearbyTournaments.length === 0 ? (
              <AppText
                testID="tournaments-nearby-empty"
                className="text-[14px] text-muted text-center py-[20px]"
              >
                No tournaments found nearby.
              </AppText>
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
            <AppText className="text-[15px] font-bold text-default mb-[10px]">
              Past Tournaments
            </AppText>
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
