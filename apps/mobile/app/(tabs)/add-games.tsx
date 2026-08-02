/**
 * Add Games tab — primary creation action.
 *
 * Two states:
 *   1. No active session  — description + "What are you playing?" chooser.
 *   2. Has active session — banner with "Continue Session" + "or start new" divider
 *                          above the same chooser.
 *
 * All four flows navigate directly to score-game (per MOBILE_ADD_GAMES_VALIDATION.md):
 *   - Flow 1 league-continue: sessionId + leagueId + seasonId, headerTitle "Continue Session"
 *   - Flow 2 league-new:      leagueId + seasonId,             headerTitle "Create New Session"
 *   - Flow 3 pickup-continue: sessionId,                       headerTitle "Pickup Session"
 *   - Flow 4 pickup-new:      no IDs (backend lazy-creates),   headerTitle "New Pickup Game"
 *
 * Wireframe refs: add-games.html, add-games-league-select.html,
 *                 add-games-pickup.html
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { League, Session } from '@beach-kings/shared';

import TopNav from '@/components/ui/TopNav';
import { GameTypeCard, LeagueSelectList } from '@/components/screens/AddGames';
import { useAuth } from '@/contexts/AuthContext';
import useRefreshOnFocus from '@/hooks/useRefreshOnFocus';
import { leagueKeys } from '@/components/screens/Leagues/leagueKeys';
import { sessionQueries } from '@/features/sessions';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { formatSessionSubtitle } from '@/lib/formatters';
import { hapticMedium } from '@/utils/haptics';
import { TrophyIcon, VolleyballIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { registerRootTabScroll } from '@/lib/rootTabScroll';

// ---------------------------------------------------------------------------
// Game-type icons
// ---------------------------------------------------------------------------

function LeagueIconSvg(): React.ReactNode {
  const palette = usePaletteColors();
  return <TrophyIcon size={24} color={palette.brandTeal} />;
}

function PickupIconSvg(): React.ReactNode {
  const palette = usePaletteColors();
  return <VolleyballIcon size={24} color={palette.brandGold} />;
}

// ---------------------------------------------------------------------------
// Active Session Banner
// ---------------------------------------------------------------------------

interface ActiveSessionBannerProps {
  readonly session: Session;
  readonly onContinue: () => void;
}

function ActiveSessionBanner({
  session,
  onContinue,
}: ActiveSessionBannerProps): React.ReactNode {
  return (
    <View className="mb-5">
      <Text className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-[10px]">
        Active Session
      </Text>
      <View className="bg-surface rounded-[14px] p-4 shadow-sm border-l-4 border-l-success dark:shadow-none dark:border border-divider">
        {/* Header row — status indicator only; the date is shown as the title below */}
        <View className="flex-row items-center gap-[5px] mb-3">
          <View className="w-[7px] h-[7px] rounded-full bg-green-500" />
          <Text className="text-[11px] font-bold text-success uppercase tracking-wide">
            Active
          </Text>
        </View>

        {/* Session name (falls back to the date-based auto name) */}
        <Text className="text-[16px] font-bold text-default mb-1">
          {session.name ?? (session.date != null ? session.date : `Session #${session.id}`)}
        </Text>

        {/* Continue button */}
        <Pressable
          testID="continue-session-btn"
          onPress={onContinue}
          accessibilityRole="button"
          accessibilityLabel="Continue Session"
          className="w-full py-[14px] rounded-[10px] bg-brand-gold items-center mt-3"
        >
          <Text className="text-white font-bold text-[15px]">Continue Session</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

function OrStartNewDivider(): React.ReactNode {
  return (
    <View className="flex-row items-center gap-3 mb-5">
      <View className="flex-1 h-px bg-divider" />
      <Text className="text-[12px] font-semibold text-muted uppercase tracking-wide">
        or start new
      </Text>
      <View className="flex-1 h-px bg-divider" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type ScreenView = 'chooser' | 'league-select';

interface LeagueWithSession extends League {
  readonly activeSession?: Session | null;
}

export default function AddGamesScreen(): React.ReactNode {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  useEffect(
    () => registerRootTabScroll('add-games', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }),
    [],
  );

  // Which sub-view is active
  const [view, setView] = useState<ScreenView>('chooser');

  const openSessionsQuery = useQuery(sessionQueries.open(userId));
  const allSessions = openSessionsQuery.data;
  const pickupSession = allSessions?.[0] ?? null;
  const sessionLoading = openSessionsQuery.isPending;

  // User leagues fetch — only needed when league-select view is open
  const leaguesQuery = useQuery({
    queryKey: leagueKeys.userLeagues(userId),
    queryFn: async (): Promise<readonly League[]> =>
      (await api.getUserLeagues()) ?? [],
    enabled: userId > 0 && view === 'league-select',
  });
  const leagues = leaguesQuery.data;
  const leaguesLoading = leaguesQuery.isPending;
  const leaguesError = leaguesQuery.error;
  const refreshOpenSessions = openSessionsQuery.refetch;
  const refreshLeagues = leaguesQuery.refetch;

  // Compute leagues with their active sessions
  const leaguesWithSessions = React.useMemo(() => {
    if (!leagues || !allSessions) return undefined;

    return leagues.map((league) => {
      const activeSession = allSessions.find(
        (session) =>
          session.league_id === league.id &&
          session.status === 'ACTIVE'
      );

      return {
        ...league,
        activeSession: activeSession ?? null,
      } as LeagueWithSession;
    });
  }, [leagues, allSessions]);

  // Refresh both when pull-to-refresh on chooser
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshOpenSessions();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshOpenSessions]);

  const refreshCriticalData = useCallback(async () => {
    await refreshOpenSessions();
  }, [refreshOpenSessions]);
  useRefreshOnFocus(refreshCriticalData, 0);

  const refreshLeagueSelection = useCallback(async () => {
    await Promise.allSettled([refreshLeagues(), refreshOpenSessions()]);
  }, [refreshLeagues, refreshOpenSessions]);

  const handleLeagueGame = useCallback(() => {
    setView('league-select');
  }, []);

  // Flow 4 — pickup-new: no IDs, backend lazy-creates session on first match submit.
  // Haptic is fired by the GameTypeCard tile press itself.
  const handlePickupGame = useCallback(() => {
    router.push(
      routes.scoreGame({
        headerTitle: 'New Pickup Game',
      }) as never,
    );
  }, [router]);

  // Flow 1 — league-continue: pre-fill from existing session participants.
  const handleContinueLeagueSession = useCallback(
    (session: Session) => {
      void hapticMedium();
      router.push(
        routes.scoreGame({
          sessionId: session.id,
          leagueId: session.league_id ?? null,
          seasonId: session.season_id,
          headerTitle: 'Continue Session',
          sessionLabel: formatSessionSubtitle(
            session.date,
            session.court_name,
            session.league_name,
          ),
          gameNumber: (session.match_count ?? 0) + 1,
        }) as never,
      );
    },
    [router],
  );

  // Flow 2 — league-new: pre-fill from league members, backend lazy-creates session.
  const handleStartNewLeagueSession = useCallback(
    (league: League) => {
      void hapticMedium();
      router.push(
        routes.scoreGame({
          leagueId: league.id,
          seasonId: league.current_season_id ?? null,
          headerTitle: 'Create New Session',
          sessionLabel: league.name,
        }) as never,
      );
    },
    [router],
  );

  // Flow 3 — pickup-continue: pre-fill from existing pickup session participants.
  const handleContinuePickupSession = useCallback(() => {
    void hapticMedium();
    if (pickupSession == null) return;
    router.push(
      routes.scoreGame({
        sessionId: pickupSession.id,
        headerTitle: 'Pickup Session',
        sessionLabel: formatSessionSubtitle(
          pickupSession.date,
          pickupSession.court_name,
          null,
        ),
        gameNumber: (pickupSession.match_count ?? 0) + 1,
      }) as never,
    );
  }, [router, pickupSession]);

  const handleJoinLeague = useCallback(() => {
    router.push(routes.findLeagues());
  }, [router]);

  const handleBack = useCallback(() => {
    setView('chooser');
  }, []);

  // ---- League Select view ----
  if (view === 'league-select') {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="add-games-screen"
      >
        <TopNav title="Select League" showBack onBack={handleBack} />
        <View className="flex-1 px-4 pt-4">
          <Text className="text-[13px] text-muted mb-4 leading-[1.4]">
            Choose a league to record a game in.
          </Text>
          <LeagueSelectList
            leagues={leaguesWithSessions}
            isLoading={leaguesLoading || sessionLoading}
            isRefreshing={false}
            error={leaguesError}
            onContinueSession={handleContinueLeagueSession}
            onStartNewSession={handleStartNewLeagueSession}
            onRetry={refreshLeagueSelection}
            onRefresh={refreshLeagueSelection}
            onJoinLeague={handleJoinLeague}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Chooser view ----
  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="add-games-screen"
    >
      <TopNav title="Add Games" />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || sessionLoading}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Active session banner (when present) */}
        {pickupSession != null && !sessionLoading && (
          <>
            <ActiveSessionBanner
              session={pickupSession}
              onContinue={handleContinuePickupSession}
            />
            <OrStartNewDivider />
          </>
        )}

        {/* No session description */}
        {(pickupSession == null && !sessionLoading) && (
          <>
            <Text className="text-[14px] text-muted mb-6 leading-[1.5]">
              Record your beach volleyball games to track your stats and climb
              the rankings.
            </Text>
            <Text className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-[10px]">
              What are you playing?
            </Text>
          </>
        )}

        {/* Game type cards */}
        <GameTypeCard
          testID="tile-league-game"
          icon={<LeagueIconSvg />}
          iconBgClass="bg-info-tint"
          title="League Game"
          description="Record a game in one of your leagues"
          onPress={handleLeagueGame}
        />

        <GameTypeCard
          testID="tile-pickup-game"
          icon={<PickupIconSvg />}
          iconBgClass="bg-warning-tint"
          title="Pickup Game"
          description="Start a new session for casual play"
          onPress={handlePickupGame}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
