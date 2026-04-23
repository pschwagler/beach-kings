/**
 * MyGamesScreen — main orchestrator for the My Games history view.
 *
 * Renders:
 *   - filter bar (result filter chips)
 *   - date-grouped list of game cards
 *   - skeleton while loading
 *   - empty state when no games
 *   - error state with retry on failure
 *   - pull-to-refresh
 *
 * Wireframe ref: my-games.html
 */

import React from 'react';
import { View, Text, SectionList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import { useMyGamesScreen } from './useMyGamesScreen';
import GameRow from './GameRow';
import GamesSkeleton from './GamesSkeleton';
import GamesEmptyState from './GamesEmptyState';
import GamesErrorState from './GamesErrorState';
import GamesFilterBar from './GamesFilterBar';
import type { GameHistoryEntry } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Date grouping helper
// ---------------------------------------------------------------------------

interface DateSection {
  readonly title: string;
  readonly data: readonly GameHistoryEntry[];
}

/** Groups a flat game list by date, preserving order within each group. */
function groupGamesByDate(games: readonly GameHistoryEntry[]): DateSection[] {
  const map = new Map<string, GameHistoryEntry[]>();

  for (const game of games) {
    const existing = map.get(game.date);
    if (existing != null) {
      existing.push(game);
    } else {
      map.set(game.date, [game]);
    }
  }

  return Array.from(map.entries()).map(([date, data]) => ({
    title: formatDateLabel(date),
    data,
  }));
}

/** "2026-03-19" → "March 19, 2026" */
function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }): React.ReactNode {
  return (
    <Text className="text-[15px] font-bold text-text-default dark:text-content-primary pt-[14px] pb-[8px] bg-bg-page dark:bg-base">
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function MyGamesScreen(): React.ReactNode {
  const {
    games,
    isLoading,
    error,
    isRefreshing,
    resultFilter,
    leagueFilter,
    setResultFilter,
    onRefresh,
    onRetry,
  } = useMyGamesScreen();

  // --- Loading skeleton ---
  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="my-games-screen"
      >
        <TopNav title="My Games" showBack />
        <GamesSkeleton />
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (error != null && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="my-games-screen"
      >
        <TopNav title="My Games" showBack />
        <GamesErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  const sections = groupGamesByDate(games);

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="my-games-screen"
    >
      <TopNav title="My Games" showBack />

      <GamesFilterBar
        resultFilter={resultFilter}
        onResultChange={setResultFilter}
        leagueFilter={leagueFilter}
        onLeagueClear={() => {}}
        activeLeagueName={null}
      />

      {games.length === 0 ? (
        <GamesEmptyState />
      ) : (
        <SectionList<GameHistoryEntry, DateSection>
          testID="games-list"
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <GameRow game={item} />}
          renderSectionHeader={({ section }) => (
            <SectionHeader title={section.title} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}
