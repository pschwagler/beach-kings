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

import React, { useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';
import { routes } from '@/lib/navigation';
import TopNav from '@/components/ui/TopNav';
import { useMyGamesScreen } from './useMyGamesScreen';
import GameRow from './GameRow';
import GamesSkeleton from './GamesSkeleton';
import GamesEmptyState from './GamesEmptyState';
import GamesErrorState from './GamesErrorState';
import GamesFilterBar from './GamesFilterBar';
import type { GameHistoryEntry } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function MyGamesScreen(): React.ReactNode {
  const router = useRouter();
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

  const handleGamePress = useCallback(
    (game: GameHistoryEntry) => {
      router.push(routes.session(game.session_id));
    },
    [router],
  );

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

      {games.length === 0 && !isLoading ? (
        <GamesEmptyState />
      ) : (
        <FlatList<GameHistoryEntry>
          testID="games-list"
          data={games}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <GameRow game={item} onPress={handleGamePress} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}
