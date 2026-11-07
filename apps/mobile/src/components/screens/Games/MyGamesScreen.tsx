import { isAccessRevokedError } from '@/lib/apiError';
import RefreshEmptyAction from '@/components/refresh/RefreshEmptyAction';
import RefreshFlatList from '@/components/refresh/RefreshFlatList';
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

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
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
import AppText from '@/components/ui/AppText';
import PlayTypeBadge from '@/components/ui/PlayTypeBadge';
import { groupHistorySessions, historySessionDate, type HistorySession } from '@/features/matches/historyPresentation';

type HistoryItem =
  | { readonly kind: 'session'; readonly session: HistorySession }
  | { readonly kind: 'game'; readonly game: GameHistoryEntry };

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
  const [collapsedSessions, setCollapsedSessions] = useState<ReadonlySet<number>>(new Set());
  const historyItems = useMemo((): HistoryItem[] => groupHistorySessions(games).flatMap((session) => [
    { kind: 'session', session } as HistoryItem,
    ...(collapsedSessions.has(session.sessionId) ? [] : session.games.map((game) => ({ kind: 'game', game } as HistoryItem))),
  ]), [games, collapsedSessions]);

  const toggleSession = (id: number): void => {
    setCollapsedSessions((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGamePress = useCallback(
    (game: GameHistoryEntry) => {
      router.push(routes.session(game.session_id));
    },
    [router],
  );

  let content: React.ReactNode;
  if (isLoading && !isRefreshing) {
    content = <GamesSkeleton />;
  } else if (error != null && (games.length === 0 || isAccessRevokedError(error))) {
    content = <><GamesErrorState onRetry={onRetry} /><RefreshEmptyAction onRefresh={onRefresh} refreshScope={JSON.stringify([leagueFilter, resultFilter, selectedPartner, selectedOpponent])} /></>;
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
          <><GamesEmptyState /><RefreshEmptyAction onRefresh={onRefresh} refreshScope={JSON.stringify([leagueFilter, resultFilter, selectedPartner, selectedOpponent])} refreshLabel="games" /></>
        ) : (
          <RefreshFlatList<HistoryItem>
            testID="games-list"
            data={historyItems}
            keyExtractor={(item) => item.kind === 'session' ? `session-${item.session.sessionId}` : `game-${item.game.id}`}
            renderItem={({ item }) => {
              if (item.kind === 'game') return <GameRow game={item.game} onPress={handleGamePress} />;
              const { session } = item;
              const first = session.games[0]!;
              const expanded = !collapsedSessions.has(session.sessionId);
              const count = session.games.length;
              return (
                <Pressable
                  testID={`history-session-${session.sessionId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${historySessionDate(session.date)}. ${first.league_name ?? 'Pickup'}. Session ${session.sessionId}. ${count} ${count === 1 ? 'game' : 'games'} shown`}
                  accessibilityHint={expanded ? 'Collapse session games' : 'Expand session games'}
                  accessibilityState={{ expanded }}
                  onPress={() => toggleSession(session.sessionId)}
                  className="min-h-touch py-md active:opacity-70"
                >
                  <View className="flex-row flex-wrap items-center justify-between gap-2">
                    <AppText className="text-callout font-bold text-default">{historySessionDate(session.date)}</AppText>
                    <PlayTypeBadge type={first.league_id != null ? 'league' : 'pickup'} noun="session" />
                  </View>
                  <AppText className="mt-xs text-caption text-muted">
                    {first.league_name != null ? `${first.league_name} · ` : ''}Session #{session.sessionId} · {count} {count === 1 ? 'game' : 'games'} shown · {expanded ? 'Collapse ↑' : 'Expand ↓'}
                  </AppText>
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
            onRefresh={onRefresh}
          refreshScope={JSON.stringify([leagueFilter, resultFilter, selectedPartner, selectedOpponent])}
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
      <TopNav title="My Games" showBack />
      {content}
    </SafeAreaView>
  );
}
