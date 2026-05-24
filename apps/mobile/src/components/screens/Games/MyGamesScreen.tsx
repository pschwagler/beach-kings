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

export default function MyGamesScreen(): React.ReactNode {
  const router = useRouter();
  const {
    games,
    isLoading,
    error,
    isRefreshing,
    resultFilter,
    leagueFilter,
    selectedPartner,
    selectedOpponent,
    availablePartners,
    availableOpponents,
    setLeagueFilter,
    setResultFilter,
    setSelectedPartner,
    setSelectedOpponent,
    onRefresh,
    onRetry,
  } = useMyGamesScreen();

  const handleGamePress = useCallback(
    (game: GameHistoryEntry) => {
      router.push(routes.session(game.session_id));
    },
    [router],
  );

  let content: React.ReactNode;
  if (isLoading && !isRefreshing) {
    content = <GamesSkeleton />;
  } else if (error != null && !isRefreshing) {
    content = <GamesErrorState onRetry={onRetry} />;
  } else {
    content = (
      <>
        <GamesFilterBar
          resultFilter={resultFilter}
          onResultChange={setResultFilter}
          leagueFilter={leagueFilter}
          onLeagueClear={() => setLeagueFilter(null)}
          activeLeagueName={null}
          availablePartners={availablePartners}
          availableOpponents={availableOpponents}
          selectedPartner={selectedPartner}
          selectedOpponent={selectedOpponent}
          onPartnerSelect={setSelectedPartner}
          onOpponentSelect={setSelectedOpponent}
        />
        {games.length === 0 ? (
          <GamesEmptyState />
        ) : (
          <FlatList<GameHistoryEntry>
            testID="games-list"
            data={games as GameHistoryEntry[]}
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
      </>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="my-games-screen"
    >
      <TopNav title="My Games" showBack backFallback={routes.profile()} />
      {content}
    </SafeAreaView>
  );
}
