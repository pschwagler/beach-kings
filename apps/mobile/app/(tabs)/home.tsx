/**
 * Home dashboard — orchestrates the Phase 2 Home screen.
 * Mirrors `mobile-audit/wireframes/home.html` structure.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { FriendRequest, Player, Session } from '@beach-kings/shared';
import { normalizePlayerStats } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/features/notifications';
import { useDashboard } from '@/hooks/useDashboard';
import useRefreshOnFocus from '@/hooks/useRefreshOnFocus';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { routes } from '@/lib/navigation';
import HomeHeader from '@/components/home/HomeHeader';
import QuickStatsRow from '@/components/home/QuickStatsRow';
import SectionHeader from '@/components/home/SectionHeader';
import SectionError from '@/components/home/SectionError';
import HomeLeadAction, { type HomeLeadState } from '@/components/home/HomeLeadAction';
import RecentGamesScroll from '@/components/home/RecentGamesScroll';
import LeaguesScroll from '@/components/home/LeaguesScroll';
import CourtsScroll from '@/components/home/CourtsScroll';
import DashboardSkeleton from '@/components/home/DashboardSkeleton';
import HomeSectionSkeleton from '@/components/home/HomeSectionSkeleton';
import MyStatsWidget from '@/components/home/MyStatsWidget';
import { registerRootTabScroll } from '@/lib/rootTabScroll';

function isActivelyPending(query: {
  readonly isPending: boolean;
  readonly isFetching: boolean;
}): boolean {
  return query.isPending && query.isFetching;
}

function computeProfilePercent(player: Player | null): number {
  if (!player) return 0;
  const fields = [
    player.gender,
    player.level,
    player.city,
    player.state,
    player.location_id,
    player.profile_picture_url,
    player.nickname,
  ];
  const completed = fields.filter((v) => v != null && v !== '').length;
  return Math.round((completed / fields.length) * 100);
}

export function resolveHomeLeadState({
  activeSession,
  activeSessionError,
  friendRequests,
  profileComplete,
  profilePercent,
}: {
  readonly activeSession: Session | null;
  readonly activeSessionError: boolean;
  readonly friendRequests: readonly FriendRequest[];
  readonly profileComplete: boolean;
  readonly profilePercent: number;
}): HomeLeadState {
  if (activeSession != null) {
    return {
      kind: 'active-session',
      session: activeSession,
      refreshFailed: activeSessionError,
    };
  }
  if (activeSessionError) return { kind: 'active-session-error' };
  if (friendRequests.length > 0) {
    return {
      kind: 'friend-request',
      count: friendRequests.length,
      senderName: friendRequests[0]?.sender_name ?? null,
    };
  }
  if (!profileComplete) return { kind: 'profile', percent: profilePercent };
  return { kind: 'record-game' };
}

export default function HomeScreen(): React.ReactNode {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const palette = usePaletteColors();
  const { profileComplete } = useAuth();
  const { unreadCount, dmUnreadCount } = useNotifications();

  const dashboard = useDashboard();
  const {
    player,
    leagues,
    activeSession,
    friendRequests,
    courts,
    matches,
    stats,
    isInitialLoading,
    isRefreshing,
    refetchAll,
  } = dashboard;

  const onRefresh = useCallback(() => {
    void refetchAll();
  }, [refetchAll]);

  const refetchPlayer = player.refetch;
  const refetchActiveSession = activeSession.refetch;
  const refreshCriticalData = useCallback(async () => {
    await Promise.allSettled([refetchPlayer(), refetchActiveSession()]);
  }, [refetchActiveSession, refetchPlayer]);
  useRefreshOnFocus(refreshCriticalData, 0);

  useEffect(
    () => registerRootTabScroll('home', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }),
    [],
  );

  const playerData = player.data ?? null;
  const leaguesData = leagues.data ?? [];
  const matchesData = matches.data ?? [];
  const courtsData = courts.data ?? [];
  const statsData = stats.data;
  const friendRequestsData = friendRequests.data ?? [];
  const activeSessionData = activeSession.data ?? null;
  const playerDependencyError =
    player.data === undefined && player.isError;
  const leadPending =
    isActivelyPending(activeSession) ||
    (activeSession.isSuccess &&
      activeSessionData == null &&
      isActivelyPending(friendRequests));
  const friendRequestError =
    activeSession.isSuccess &&
    activeSessionData == null &&
    friendRequests.isError;

  const firstName =
    playerData?.first_name ?? playerData?.name?.split(' ')[0] ?? 'Player';
  // `/api/users/me/player` nests the aggregates under `stats` (current_rating,
  // total_games, total_wins) and exposes no `losses` field — derive it. Fall
  // back to any top-level fields for robustness against other player shapes.
  // See normalizePlayerStats for the shared nested-first, flat-fallback logic.
  // This is the caller's OWN player, so wins/losses are never privacy-hidden
  // (`normalizePlayerStats` can return null for a hidden public profile) — the
  // `?? 0` floors are type-satisfiers that never fire here.
  const { rating, wins: winsRaw, losses: lossesRaw } = normalizePlayerStats(playerData);
  const wins = winsRaw ?? 0;
  const losses = lossesRaw ?? 0;
  const profilePercent = computeProfilePercent(playerData);
  const leadState = resolveHomeLeadState({
    activeSession: activeSessionData,
    activeSessionError: activeSession.isError,
    friendRequests: friendRequestsData,
    profileComplete,
    profilePercent,
  });

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
    >
      <HomeHeader
        userName={playerData?.name ?? firstName}
        avatarUrl={playerData?.profile_picture_url ?? null}
        playerId={playerData?.id ?? null}
        dmUnreadCount={dmUnreadCount}
        notificationUnreadCount={unreadCount}
      />

      <QuickStatsRow
        firstName={firstName}
        rating={rating}
        wins={wins}
        losses={losses}
      />

      <ScrollView
        ref={scrollRef}
        testID="home-scroll"
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing && !isInitialLoading}
            onRefresh={onRefresh}
            tintColor={palette.brandTeal}
          />
        }
      >
        {isInitialLoading ? (
          <DashboardSkeleton />
        ) : (
          <View testID="home-sections" className="px-lg pt-md pb-xxxl">
            {leadPending ? (
              <HomeSectionSkeleton label="next action" wide />
            ) : friendRequestError ? (
              <View className="mb-lg">
                <SectionError
                  message="Could not load friend requests."
                  onRetry={() => void friendRequests.refetch()}
                />
              </View>
            ) : (
              <HomeLeadAction
                state={leadState}
                onRetryActiveSession={() => void activeSession.refetch()}
              />
            )}

            <View className="mb-lg">
              <SectionHeader
                title="Recent Games"
                linkLabel="View All"
                onLinkPress={() => router.push(routes.myGames())}
              />
              {playerDependencyError ? (
                <SectionError
                  message="Could not load recent games because your profile is unavailable."
                  onRetry={() => void player.refetch()}
                />
              ) : isActivelyPending(matches) ? (
                <HomeSectionSkeleton label="recent games" />
              ) : matches.isError ? (
                <SectionError
                  message="Could not load your recent games."
                  onRetry={() => void matches.refetch()}
                />
              ) : (
                <RecentGamesScroll matches={matchesData} maxItems={2} />
              )}
            </View>

            <View className="mb-lg">
              <SectionHeader
                title="My Leagues"
                linkLabel="View All"
                onLinkPress={() => router.push(routes.leagues())}
              />
              {isActivelyPending(leagues) ? (
                <HomeSectionSkeleton label="leagues" />
              ) : leagues.isError ? (
                <SectionError
                  message="Could not load your leagues."
                  onRetry={() => void leagues.refetch()}
                />
              ) : (
                <LeaguesScroll
                  leagues={leaguesData}
                  currentUserPlayerId={playerData?.id ?? null}
                  maxItems={2}
                />
              )}
            </View>

            <View testID="home-my-stats-section" className="mb-lg">
              <SectionHeader
                title="My Stats"
                linkLabel="View All"
                onLinkPress={() => router.push(routes.myStats())}
              />
              {isActivelyPending(stats) ? (
                <HomeSectionSkeleton label="my stats" />
              ) : statsData === undefined && stats.isError ? (
                <SectionError
                  message="Could not load your stats."
                  onRetry={() => void stats.refetch()}
                />
              ) : statsData != null ? (
                <>
                  <MyStatsWidget
                    stats={statsData}
                    onPress={() => router.push(routes.myStats())}
                  />
                  {stats.isError ? (
                    <View className="mt-sm">
                      <SectionError
                        message="Your stats may be out of date."
                        onRetry={() => void stats.refetch()}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>

            <View testID="home-courts-section" className="mb-lg">
              <SectionHeader
                title="Courts Near You"
                linkLabel="See Map"
                onLinkPress={() => router.push(routes.courts())}
              />
              {playerDependencyError ? (
                <SectionError
                  message="Could not load nearby courts because your profile is unavailable."
                  onRetry={() => void player.refetch()}
                />
              ) : isActivelyPending(courts) ? (
                <HomeSectionSkeleton label="nearby courts" />
              ) : courts.isError ? (
                <SectionError
                  message="Could not load nearby courts."
                  onRetry={() => void courts.refetch()}
                />
              ) : (
                <CourtsScroll courts={courtsData} maxItems={3} />
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
