/**
 * Add Games tab — primary creation action.
 *
 * Two states:
 *   1. No active session  — description + "What are you playing?" chooser.
 *   2. Has active session — banner with "Continue Session" + "or start new" divider
 *                          above the same chooser.
 *
 * Chooser tiles:
 *   - League Game   → inline league picker (fetches user leagues), then navigate
 *                     to the active session for that league or session/create.
 *   - Pickup Game   → navigate to /(stack)/session/create
 *
 * Wireframe refs: add-games.html, add-games-league-select.html,
 *                 add-games-pickup.html
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { League, Session } from '@beach-kings/shared';

import TopNav from '@/components/ui/TopNav';
import { GameTypeCard, LeagueSelectList } from '@/components/screens/AddGames';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticMedium } from '@/utils/haptics';
import Svg, { Path, Circle } from 'react-native-svg';

// ---------------------------------------------------------------------------
// Inline icons (SVG path copied from wireframe)
// ---------------------------------------------------------------------------

function LeagueIconSvg(): React.ReactNode {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"
        stroke="#2a7d9c"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"
        stroke="#2a7d9c"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18 9h1.5a1 1 0 0 0 0-5H18"
        stroke="#2a7d9c"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 22h16"
        stroke="#2a7d9c"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"
        stroke="#2a7d9c"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 9H4.5a1 1 0 0 1 0-5H6"
        stroke="#2a7d9c"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PickupIconSvg(): React.ReactNode {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={12}
        cy={12}
        r={10}
        stroke="#d4a843"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
        stroke="#d4a843"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 12h20"
        stroke="#d4a843"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
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
      <Text className="text-[12px] font-semibold text-text-muted dark:text-content-tertiary uppercase tracking-wide mb-[10px]">
        Active Session
      </Text>
      <View className="bg-white dark:bg-dark-surface rounded-[14px] p-4 shadow-sm border-l-4 border-l-green-500 dark:shadow-none dark:border dark:border-border-subtle">
        {/* Header row */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-[5px]">
            <View className="w-[7px] h-[7px] rounded-full bg-green-500" />
            <Text className="text-[11px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">
              Active
            </Text>
          </View>
          <Text className="text-[11px] text-text-muted dark:text-content-tertiary">
            {session.date != null ? session.date : 'In progress'}
          </Text>
        </View>

        {/* Session name */}
        <Text className="text-[16px] font-bold text-text-default dark:text-content-primary mb-1">
          {session.name ?? `Session #${session.id}`}
        </Text>

        {/* Continue button */}
        <Pressable
          testID="continue-session-btn"
          onPress={onContinue}
          accessibilityRole="button"
          accessibilityLabel="Continue Session"
          className="w-full py-[14px] rounded-[10px] bg-accent dark:bg-brand-gold items-center mt-3"
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
      <View className="flex-1 h-px bg-gray-200 dark:bg-border-subtle" />
      <Text className="text-[12px] font-semibold text-text-muted dark:text-content-tertiary uppercase tracking-wide">
        or start new
      </Text>
      <View className="flex-1 h-px bg-gray-200 dark:bg-border-subtle" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type ScreenView = 'chooser' | 'league-select';

export default function AddGamesScreen(): React.ReactNode {
  const router = useRouter();

  // Which sub-view is active
  const [view, setView] = useState<ScreenView>('chooser');

  // Active session fetch
  const {
    data: activeSession,
    isLoading: sessionLoading,
    refetch: refetchSession,
  } = useApi<Session | null>(() => api.getActiveSession(), []);

  // User leagues fetch — only needed when league-select view is open
  const {
    data: leagues,
    isLoading: leaguesLoading,
    error: leaguesError,
    refetch: refetchLeagues,
  } = useApi<readonly League[]>(
    () => api.getUserLeagues(),
    [view],
    { enabled: view === 'league-select' },
  );

  // Refresh both when pull-to-refresh on chooser
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchSession();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchSession]);

  const handleLeagueGame = useCallback(() => {
    setView('league-select');
  }, []);

  const handlePickupGame = useCallback(() => {
    router.push(routes.createSession());
  }, [router]);

  const handleLeagueSelect = useCallback(
    (_league: League) => {
      // Navigate to create a session. A future iteration can pass the leagueId
      // as a param once session/create supports it.
      router.push(routes.createSession());
    },
    [router],
  );

  const handleContinueSession = useCallback(() => {
    void hapticMedium();
    if (activeSession != null) {
      router.push(routes.session(activeSession.id));
    }
  }, [router, activeSession]);

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
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="add-games-screen"
      >
        <TopNav title="Select League" showBack onBack={handleBack} />
        <View className="flex-1 px-4 pt-4">
          <Text className="text-[13px] text-text-muted dark:text-content-tertiary mb-4 leading-[1.4]">
            Choose a league to record a game in.
          </Text>
          <LeagueSelectList
            leagues={leagues}
            isLoading={leaguesLoading}
            isRefreshing={false}
            error={leaguesError}
            onSelect={handleLeagueSelect}
            onRetry={refetchLeagues}
            onRefresh={refetchLeagues}
            onJoinLeague={handleJoinLeague}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Chooser view ----
  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="add-games-screen"
    >
      <TopNav title="Add Games" />
      <ScrollView
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
        {activeSession != null && !sessionLoading && (
          <>
            <ActiveSessionBanner
              session={activeSession}
              onContinue={handleContinueSession}
            />
            <OrStartNewDivider />
          </>
        )}

        {/* No session description */}
        {(activeSession == null && !sessionLoading) && (
          <>
            <Text className="text-[14px] text-text-muted dark:text-content-tertiary mb-6 leading-[1.5]">
              Record your beach volleyball games to track your stats and climb
              the rankings.
            </Text>
            <Text className="text-[12px] font-semibold text-text-muted dark:text-content-tertiary uppercase tracking-wide mb-[10px]">
              What are you playing?
            </Text>
          </>
        )}

        {/* Game type cards */}
        <GameTypeCard
          testID="tile-league-game"
          icon={<LeagueIconSvg />}
          iconBgClass="bg-teal-50 dark:bg-info-bg"
          title="League Game"
          description="Record a game in one of your leagues"
          onPress={handleLeagueGame}
        />

        <GameTypeCard
          testID="tile-pickup-game"
          icon={<PickupIconSvg />}
          iconBgClass="bg-yellow-50 dark:bg-warning-bg"
          title="Pickup Game"
          description="Start a new session for casual play"
          onPress={handlePickupGame}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
