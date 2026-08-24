/**
 * Profile tab screen.
 * Mirrors mobile-audit/wireframes/profile.html — avatar header, stats bar,
 * player info fields, and settings/logout shortcuts.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View, Pressable, RefreshControl } from 'react-native';
import AppText from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizePlayerStats } from '@beach-kings/shared';
import type { Player } from '@beach-kings/shared';
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
import ProfileFieldSheet from '@/components/screens/Profile/ProfileFieldSheet';
import type { ProfileEditorKey } from '@/components/screens/Profile/profileEditorModel';
import { useProfilePhotoActions } from '@/components/screens/Profile/useProfilePhotoActions';
import { registerRootTabScroll } from '@/lib/rootTabScroll';
import { playerKeys, usePlayerProfileMutations } from '@/features/player';
import { useToast } from '@/contexts/ToastContext';
import { hapticSuccess } from '@/utils/haptics';
import { getApiErrorMessage } from '@/lib/apiError';
import ProfileHomeCourtsSection from '@/components/screens/Profile/ProfileHomeCourtsSection';

export const PROFILE_INITIAL_LOAD_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen(): React.ReactNode {
  const router = useRouter();
  const { logout, user } = useAuth();
  const palette = usePaletteColors();
  const scrollRef = useRef<ScrollView>(null);
  const [editor, setEditor] = useState<ProfileEditorKey | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [timedOutLoad, setTimedOutLoad] = useState<{
    readonly userId: number;
    readonly attempt: number;
  } | null>(null);
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const playerQuery = useCurrentPlayer();
  const friendCountQuery = useQuery(socialQueries.friendCount(userId));
  const refetchPlayer = playerQuery.refetch;
  const refetchFriendCount = friendCountQuery.refetch;

  const onRefresh = useCallback(async () => {
    await Promise.allSettled([refetchPlayer(), refetchFriendCount()]);
  }, [refetchFriendCount, refetchPlayer]);

  useRefreshOnFocus(onRefresh, 0);

  useEffect(
    () =>
      registerRootTabScroll('profile', () => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }),
    [],
  );

  const player = playerQuery.data ?? null;
  const { updateProfile } = usePlayerProfileMutations();
  const { showToast } = useToast();
  const photoActions = useProfilePhotoActions(player);
  const friendCount = friendCountQuery.data ?? null;
  const hasPlayerData = playerQuery.data !== undefined;
  const isWaitingForInitialPlayer = !hasPlayerData && playerQuery.isPending;
  const didInitialLoadTimeOut =
    timedOutLoad?.userId === userId && timedOutLoad.attempt === loadAttempt;
  const isInitialLoading = isWaitingForInitialPlayer && !didInitialLoadTimeOut;
  const isInitialError =
    !hasPlayerData && (playerQuery.isError || didInitialLoadTimeOut);
  const hasPlayerRefreshError = hasPlayerData && playerQuery.isError;
  const isRefreshing =
    hasPlayerData && (playerQuery.isFetching || friendCountQuery.isFetching);

  useEffect(() => {
    if (!isWaitingForInitialPlayer) return;
    const timer = setTimeout(() => {
      setTimedOutLoad({ userId, attempt: loadAttempt });
    }, PROFILE_INITIAL_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isWaitingForInitialPlayer, loadAttempt, userId]);

  const retryInitialLoad = useCallback(() => {
    setLoadAttempt((attempt) => attempt + 1);
    void (async () => {
      await queryClient.cancelQueries({
        queryKey: playerKeys.me(userId),
        exact: true,
      });
      await Promise.allSettled([refetchPlayer(), refetchFriendCount()]);
    })();
  }, [queryClient, refetchFriendCount, refetchPlayer, userId]);

  // `/api/users/me/player` nests aggregates under `stats` (current_rating,
  // total_games, total_wins) and exposes no `losses` field — derive it. Fall
  // back to top-level fields for other player shapes (e.g. player search).
  // See normalizePlayerStats for the shared nested-first, flat-fallback logic.
  // This is the caller's OWN player, so wins/losses are never privacy-hidden
  // (`normalizePlayerStats` returns null for a hidden public profile) — the
  // `?? 0` floors are type-satisfiers that never fire here.
  const {
    rating,
    games,
    wins: winsRaw,
    losses: lossesRaw,
  } = normalizePlayerStats(player);
  const wins = winsRaw ?? 0;
  const losses = lossesRaw ?? 0;

  const saveProfileFields = useCallback(async (updates: Partial<Player>) => {
    try {
      await updateProfile.mutateAsync(updates);
      void hapticSuccess();
      showToast('Profile updated.', 'success');
    } catch (error) {
      throw new Error(getApiErrorMessage(
        error,
        'Your profile could not be saved. Please try again.',
      ));
    }
  }, [showToast, updateProfile]);

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav title="Profile" />

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        testID="profile-scroll-view"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void onRefresh();
            }}
            tintColor={palette.brandTeal}
          />
        }
      >
        {isInitialLoading ? (
          <ProfileSkeleton />
        ) : isInitialError ? (
          <ErrorState
            onRetry={() => {
              retryInitialLoad();
            }}
          />
        ) : (
          <>
            {hasPlayerRefreshError && (
              <View className="px-lg pt-lg">
                <SectionError
                  message="Some profile details could not be refreshed. Showing the last saved version."
                  onRetry={() => {
                    void onRefresh();
                  }}
                />
              </View>
            )}

            <ProfileHeader
              player={player}
              isLoading={false}
              friendCount={friendCount}
              friendCountError={friendCountQuery.isError}
              onPhotoPress={photoActions.onPhotoPress}
              photoBusy={photoActions.busy}
              onFriendsPress={() =>
                router.push(routes.social({ tab: 'friends' }))
              }
              onFriendCountRetry={() => {
                void refetchFriendCount();
              }}
            />

            <StatsBar
              games={games}
              rating={rating}
              wins={wins}
              losses={losses}
              isLoading={false}
            />

            {player != null && (
              <>
                <ProfileInfoSection player={player} onEdit={setEditor} />
                <ProfileHomeCourtsSection
                  playerId={player.id}
                  onEdit={() => router.push(routes.homeCourts())}
                />
              </>
            )}

            <ProfileMenuSection
              onSettingsPress={() => router.push(routes.settings())}
              onMyStatsPress={() => router.push(routes.myStats())}
              onMyGamesPress={() => router.push(routes.myGames())}
              onFriendsPress={() =>
                router.push(routes.social({ tab: 'friends' }))
              }
              onLogout={logout}
            />
          </>
        )}
      </ScrollView>
      {player != null ? (
        <ProfileFieldSheet
          editor={editor}
          player={player}
          saving={updateProfile.isPending}
          onClose={() => setEditor(null)}
          onSave={saveProfileFields}
        />
      ) : null}
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
      <AppText className="text-base font-semibold text-default text-center mb-sm">
        Could not load your profile
      </AppText>
      <AppText className="text-sm text-muted text-center mb-lg">
        Check your connection and try again.
      </AppText>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading profile"
        className="bg-brand-teal px-xl py-sm rounded-xl active:opacity-80"
      >
        <AppText className="text-on-brand-teal font-semibold text-sm">
          Retry
        </AppText>
      </Pressable>
    </View>
  );
}
