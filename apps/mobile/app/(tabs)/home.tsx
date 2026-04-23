/**
 * Home dashboard — orchestrates the Phase 2 Home screen.
 * Mirrors `mobile-audit/wireframes/home.html` structure.
 */

import React, { useCallback } from 'react';
import { ScrollView, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Player, MatchRecord } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useDashboard } from '@/hooks/useDashboard';
import { routes } from '@/lib/navigation';
import HomeHeader from '@/components/home/HomeHeader';
import QuickStatsRow from '@/components/home/QuickStatsRow';
import SectionHeader from '@/components/home/SectionHeader';
import SectionError from '@/components/home/SectionError';
import ProfileBanner from '@/components/home/ProfileBanner';
import PendingInvitesBanner from '@/components/home/PendingInvitesBanner';
import SessionCard from '@/components/home/SessionCard';
import RecentGamesScroll from '@/components/home/RecentGamesScroll';
import LeaguesScroll from '@/components/home/LeaguesScroll';
import TournamentsEmpty from '@/components/home/TournamentsEmpty';
import CourtsScroll from '@/components/home/CourtsScroll';
import NewUserWelcome from '@/components/home/NewUserWelcome';
import DashboardSkeleton from '@/components/home/DashboardSkeleton';

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
    player.date_of_birth,
  ];
  const completed = fields.filter((v) => v != null && v !== '').length;
  return Math.round((completed / fields.length) * 100);
}

function countPendingInviteGames(matches: readonly MatchRecord[]): number {
  return matches.filter(
    (m) =>
      m.partner_is_placeholder === true ||
      m.opponent_1_is_placeholder === true ||
      m.opponent_2_is_placeholder === true,
  ).length;
}

export default function HomeScreen(): React.ReactNode {
  const router = useRouter();
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
    isInitialLoading,
    isRefreshing,
    refetchAll,
  } = dashboard;

  const onRefresh = useCallback(() => {
    void refetchAll();
  }, [refetchAll]);

  const playerData = player.data ?? null;
  const leaguesData = leagues.data ?? [];
  const matchesData = matches.data ?? [];
  const courtsData = courts.data ?? [];
  const friendRequestsData = friendRequests.data ?? [];
  const activeSessionData = activeSession.data ?? null;

  const firstName =
    playerData?.first_name ?? playerData?.name?.split(' ')[0] ?? 'Player';
  const rating = playerData?.current_rating ?? null;
  const wins = playerData?.wins ?? 0;
  const losses = playerData?.losses ?? 0;
  const profilePercent = computeProfilePercent(playerData);
  const invitesPending = friendRequestsData.length;
  const pendingGameCount = countPendingInviteGames(matchesData);

  const isBrandNewUser =
    !isInitialLoading &&
    matches.isSuccess &&
    leagues.isSuccess &&
    matchesData.length === 0 &&
    leaguesData.length === 0;

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <HomeHeader
        userName={playerData?.name ?? firstName}
        avatarUrl={playerData?.profile_picture_url ?? null}
        dmUnreadCount={dmUnreadCount}
        notificationUnreadCount={unreadCount}
      />

      {!isBrandNewUser && (
        <QuickStatsRow
          firstName={firstName}
          rating={rating}
          wins={wins}
          losses={losses}
        />
      )}

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing && !isInitialLoading}
            onRefresh={onRefresh}
            tintColor="#2a7d9c"
          />
        }
      >
        {isInitialLoading ? (
          <DashboardSkeleton />
        ) : isBrandNewUser ? (
          <NewUserWelcome />
        ) : (
          <View className="px-lg pt-md pb-xxxl">
            {!profileComplete && <ProfileBanner percent={profilePercent} />}

            {invitesPending > 0 && profileComplete && (
              <PendingInvitesBanner
                playerCount={invitesPending}
                gameCount={pendingGameCount}
                onPress={() => router.push(routes.social())}
              />
            )}

            {activeSession.isError && (
              <View className="mb-lg">
                <SectionHeader title="Active Session" />
                <SectionError
                  message="Could not load your active session."
                  onRetry={() => void activeSession.refetch()}
                />
              </View>
            )}

            {activeSessionData && !activeSession.isError && (
              <View className="mb-lg">
                <SectionHeader title="Active Session" />
                <SessionCard
                  session={activeSessionData}
                  badgeLabel="ACTIVE"
                  badgeTone="active"
                  accentBorder
                />
              </View>
            )}

            <View className="mb-lg">
              <SectionHeader
                title="Recent Games"
                linkLabel="View All"
                onLinkPress={() => router.push(routes.myGames())}
              />
              {matches.isError ? (
                <SectionError
                  message="Could not load your recent games."
                  onRetry={() => void matches.refetch()}
                />
              ) : (
                <RecentGamesScroll matches={matchesData} />
              )}
            </View>

            <View className="mb-lg">
              <SectionHeader
                title="My Leagues"
                linkLabel="View All"
                onLinkPress={() => router.push(routes.leagues())}
              />
              {leagues.isError ? (
                <SectionError
                  message="Could not load your leagues."
                  onRetry={() => void leagues.refetch()}
                />
              ) : (
                <LeaguesScroll
                  leagues={leaguesData}
                  currentUserPlayerId={playerData?.id ?? null}
                />
              )}
            </View>

            <View className="mb-lg">
              <SectionHeader title="Tournaments" />
              <TournamentsEmpty />
            </View>

            <View className="mb-lg">
              <SectionHeader
                title="Courts Near You"
                linkLabel="See Map"
                onLinkPress={() => router.push(routes.courts())}
              />
              {courts.isError ? (
                <SectionError
                  message="Could not load nearby courts."
                  onRetry={() => void courts.refetch()}
                />
              ) : (
                <CourtsScroll courts={courtsData} />
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
