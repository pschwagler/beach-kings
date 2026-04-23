/**
 * Profile tab screen.
 * Mirrors mobile-audit/wireframes/profile.html — avatar header, stats bar,
 * player info fields, and settings/logout shortcuts.
 */

import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, Pressable, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Player } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import useApi from '@/hooks/useApi';
import TopNav from '@/components/ui/TopNav';
import ProfileHeader from '@/components/screens/Profile/ProfileHeader';
import StatsBar from '@/components/screens/Profile/StatsBar';
import ProfileInfoSection from '@/components/screens/Profile/ProfileInfoSection';
import ProfileMenuSection from '@/components/screens/Profile/ProfileMenuSection';
import ProfileSkeleton from '@/components/screens/Profile/ProfileSkeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileData {
  readonly player: Player;
  readonly friendCount: number;
}

// ---------------------------------------------------------------------------
// Fetch helper (stable reference — defined outside component)
// ---------------------------------------------------------------------------

async function fetchProfileData(): Promise<ProfileData> {
  const [player, friendsResult] = await Promise.all([
    api.getCurrentUserPlayer(),
    api.getFriends({ limit: 1 }).catch(() => ({ friends: [], total: 0 })),
  ]);
  const total =
    typeof (friendsResult as { total?: number }).total === 'number'
      ? (friendsResult as { total: number }).total
      : ((friendsResult as { friends?: unknown[] }).friends?.length ?? 0);
  return { player, friendCount: total };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen(): React.ReactNode {
  const router = useRouter();
  const { logout } = useAuth();

  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, error, isLoading, refetch } = useApi<ProfileData>(
    fetchProfileData,
    [refreshKey],
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const handleRetry = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const player = data?.player ?? null;
  const friendCount = data?.friendCount ?? 0;

  const wins = player?.wins ?? 0;
  const losses = player?.losses ?? 0;
  const games = player?.total_games ?? (wins + losses > 0 ? wins + losses : 0);
  const rating = player?.current_rating ?? null;

  const rightAction = (
    <Pressable
      onPress={() => router.push(routes.settings())}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      className="min-w-touch min-h-touch items-center justify-center"
    >
      <Text className="text-gold dark:text-gold font-semibold text-sm">
        Settings
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base" edges={['top']}>
      <TopNav title="Profile" rightAction={rightAction} />

      <ScrollView
        className="flex-1"
        testID="profile-scroll-view"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing && !isLoading}
            onRefresh={() => { void onRefresh(); }}
            tintColor="#2a7d9c"
          />
        }
      >
        {isLoading && !isRefreshing ? (
          <ProfileSkeleton />
        ) : error != null ? (
          <ErrorState onRetry={handleRetry} />
        ) : (
          <>
            <ProfileHeader
              player={player}
              isLoading={false}
              friendCount={friendCount}
              onEditPress={() => router.push(routes.settings())}
              onFriendsPress={() => router.push(routes.social())}
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
              onFriendsPress={() => router.push(routes.social())}
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
      <Text className="text-base font-semibold text-text-default dark:text-content-primary text-center mb-sm">
        Could not load your profile
      </Text>
      <Text className="text-sm text-text-muted dark:text-text-tertiary text-center mb-lg">
        Check your connection and try again.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading profile"
        className="bg-primary dark:bg-brand-teal px-xl py-sm rounded-xl active:opacity-80"
      >
        <Text className="text-white font-semibold text-sm">Retry</Text>
      </Pressable>
    </View>
  );
}
