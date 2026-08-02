/**
 * Profile tab screen.
 * Mirrors mobile-audit/wireframes/profile.html — avatar header, stats bar,
 * player info fields, and settings/logout shortcuts.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View, Text, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { normalizePlayerStats } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { routes } from '@/lib/navigation';
import { useCurrentPlayer } from '@/hooks/useCurrentPlayer';
import useRefreshOnFocus from '@/hooks/useRefreshOnFocus';
import { socialQueries } from '@/features/social';
import { usePaletteColors } from '@/theme/usePaletteColors';
import TopNav from '@/components/ui/TopNav';
import SectionError from '@/components/home/SectionError';
import ProfileHeader from '@/components/screens/Profile/ProfileHeader';
import StatsBar from '@/components/screens/Profile/StatsBar';
import ProfileInfoSection from '@/components/screens/Profile/ProfileInfoSection';
import ProfileMenuSection from '@/components/screens/Profile/ProfileMenuSection';
import ProfileSkeleton from '@/components/screens/Profile/ProfileSkeleton';
import { registerRootTabScroll } from '@/lib/rootTabScroll';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen(): React.ReactNode {
  const router = useRouter();
  const { logout, user } = useAuth();
  const palette = usePaletteColors();
  const scrollRef = useRef<ScrollView>(null);
  const userId = user?.id ?? 0;
  const playerQuery = useCurrentPlayer();
  const friendCountQuery = useQuery(socialQueries.friendCount(userId));
  const refetchPlayer = playerQuery.refetch;
  const refetchFriendCount = friendCountQuery.refetch;

  const onRefresh = useCallback(async () => {
    await Promise.allSettled([
      refetchPlayer(),
      refetchFriendCount(),
    ]);
  }, [refetchFriendCount, refetchPlayer]);

  useRefreshOnFocus(onRefresh, 0);

  useEffect(
    () => registerRootTabScroll('profile', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }),
    [],
  );

  const player = playerQuery.data ?? null;
  const friendCount = friendCountQuery.data ?? null;
  const hasPlayerData = playerQuery.data !== undefined;
  const isInitialLoading = !hasPlayerData && playerQuery.isPending;
  const isInitialError = !hasPlayerData && playerQuery.isError;
  const hasRefreshError = hasPlayerData
    && (playerQuery.isError || friendCountQuery.isError);
  const isRefreshing = hasPlayerData
    && (playerQuery.isFetching || friendCountQuery.isFetching);

  // `/api/users/me/player` nests aggregates under `stats` (current_rating,
  // total_games, total_wins) and exposes no `losses` field — derive it. Fall
  // back to top-level fields for other player shapes (e.g. player search).
  // See normalizePlayerStats for the shared nested-first, flat-fallback logic.
  // This is the caller's OWN player, so wins/losses are never privacy-hidden
  // (`normalizePlayerStats` returns null for a hidden public profile) — the
  // `?? 0` floors are type-satisfiers that never fire here.
  const { rating, games, wins: winsRaw, losses: lossesRaw } = normalizePlayerStats(player);
  const wins = winsRaw ?? 0;
  const losses = lossesRaw ?? 0;

  const rightAction = (
    <Pressable
      onPress={() => router.push(routes.settings())}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      className="min-w-touch min-h-touch items-center justify-center"
    >
      <Text className="text-brand-gold font-semibold text-sm">
        Settings
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav title="Profile" rightAction={rightAction} />

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        testID="profile-scroll-view"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { void onRefresh(); }}
            tintColor={palette.brandTeal}
          />
        }
      >
        {isInitialLoading ? (
          <ProfileSkeleton />
        ) : isInitialError ? (
          <ErrorState onRetry={() => { void onRefresh(); }} />
        ) : (
          <>
            {hasRefreshError && (
              <View className="px-lg pt-lg">
                <SectionError
                  message="Some profile details could not be refreshed. Showing the last saved version."
                  onRetry={() => { void onRefresh(); }}
                />
              </View>
            )}

            <ProfileHeader
              player={player}
              isLoading={false}
              friendCount={friendCount}
              onEditPress={() => router.push(routes.editProfile())}
              onFriendsPress={() => router.push(routes.social({ tab: 'friends' }))}
            />

            <StatsBar
              games={games}
              rating={rating}
              wins={wins}
              losses={losses}
              isLoading={false}
            />

            {player != null && (
              <ProfileInfoSection player={player} />
            )}

            <ProfileMenuSection
              onSettingsPress={() => router.push(routes.settings())}
              onMyStatsPress={() => router.push(routes.myStats())}
              onMyGamesPress={() => router.push(routes.myGames())}
              onFriendsPress={() => router.push(routes.social({ tab: 'friends' }))}
              onLogout={logout}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Error state sub-component
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  readonly onRetry: () => void;
}

function ErrorState({ onRetry }: ErrorStateProps): React.ReactNode {
  return (
    <View
      className="flex-1 items-center justify-center px-xl py-xxxl"
      accessibilityRole="alert"
      accessibilityLabel="Failed to load profile"
    >
      <Text className="text-base font-semibold text-default text-center mb-sm">
        Could not load your profile
      </Text>
      <Text className="text-sm text-muted text-center mb-lg">
        Check your connection and try again.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading profile"
        className="bg-brand-teal px-xl py-sm rounded-xl active:opacity-80"
      >
        <Text className="text-white font-semibold text-sm">Retry</Text>
      </Pressable>
    </View>
  );
}
