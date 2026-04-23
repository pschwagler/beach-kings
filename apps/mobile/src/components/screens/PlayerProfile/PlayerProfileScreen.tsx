/**
 * PlayerProfileScreen — orchestrator for viewing another player's public profile.
 *
 * Renders:
 *   - Profile header with avatar, name, friend/message actions
 *   - Mutual friends strip
 *   - Trophies horizontal scroll
 *   - Stats grid
 *   - Leagues list
 *   - Skeleton while loading
 *   - Error state with retry
 *   - Pull-to-refresh
 *   - Action sheet (block / report)
 *
 * Wireframe ref: player-profile.html
 */

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { usePlayerProfileScreen } from './usePlayerProfileScreen';
import PlayerProfileHeader from './PlayerProfileHeader';
import PlayerMutualFriends from './PlayerMutualFriends';
import PlayerTrophiesList from './PlayerTrophiesList';
import PlayerStatsGrid from './PlayerStatsGrid';
import PlayerLeaguesList from './PlayerLeaguesList';
import PlayerProfileSkeleton from './PlayerProfileSkeleton';
import PlayerProfileErrorState from './PlayerProfileErrorState';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlayerProfileScreenProps {
  readonly playerId: string | number;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PlayerProfileScreen({
  playerId,
}: PlayerProfileScreenProps): React.ReactNode {
  const router = useRouter();
  const [showActionSheet, setShowActionSheet] = useState(false);

  const navigateToMessages = useCallback(
    (id: number, name?: string) => {
      void hapticMedium();
      router.push(routes.messages(id, name));
    },
    [router],
  );

  const {
    profileData,
    isLoading,
    error,
    isFriendActionLoading,
    onRefresh,
    isRefreshing,
    onAddFriend,
    onMessage,
  } = usePlayerProfileScreen(playerId, navigateToMessages);

  const handleAddFriend = useCallback(() => {
    void hapticMedium();
    void onAddFriend();
  }, [onAddFriend]);

  const handleLeaguePress = useCallback(
    (id: number) => {
      router.push(routes.league(id));
    },
    [router],
  );

  const handleMorePress = useCallback(() => {
    void hapticLight();
    setShowActionSheet(true);
  }, []);

  const handleBlock = useCallback(() => {
    setShowActionSheet(false);
    Alert.alert('Block User', 'This user has been blocked.', [{ text: 'OK' }]);
    // TODO(backend): POST /api/players/:id/block
  }, []);

  const handleReport = useCallback(() => {
    setShowActionSheet(false);
    Alert.alert('Report Submitted', 'Thank you for your report.', [{ text: 'OK' }]);
    // TODO(backend): POST /api/players/:id/report
  }, []);

  const playerName =
    profileData != null
      ? [profileData.player.first_name, profileData.player.last_name]
          .filter(Boolean)
          .join(' ') || profileData.player.name || 'Player'
      : 'Player';

  const rightAction = (
    <Pressable
      testID="player-more-btn"
      onPress={handleMorePress}
      accessibilityRole="button"
      accessibilityLabel="More options"
      className="min-w-touch min-h-touch items-center justify-center"
    >
      <Text className="text-white text-xl">•••</Text>
    </Pressable>
  );

  return (
    <SafeAreaView
      testID="player-profile-screen"
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Player" showBack rightAction={rightAction} />

      {isLoading && !isRefreshing ? (
        <PlayerProfileSkeleton />
      ) : error != null && !isRefreshing ? (
        <PlayerProfileErrorState onRetry={onRefresh} />
      ) : profileData != null ? (
        <ScrollView
          testID="player-profile-scroll"
          className="flex-1"
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        >
          <PlayerProfileHeader
            player={profileData.player}
            friendStatus={profileData.friendStatus}
            isFriendActionLoading={isFriendActionLoading}
            onAddFriend={handleAddFriend}
            onMessage={onMessage}
          />

          <PlayerMutualFriends mutualFriends={profileData.mutualFriends} />

          {profileData.trophies.length > 0 && (
            <PlayerTrophiesList trophies={profileData.trophies} />
          )}

          <PlayerStatsGrid player={profileData.player} />

          <PlayerLeaguesList
            leagues={profileData.leagues}
            onLeaguePress={handleLeaguePress}
          />
        </ScrollView>
      ) : null}

      {/* Action sheet overlay */}
      {showActionSheet && (
        <ActionSheet
          playerName={playerName}
          onBlock={handleBlock}
          onReport={handleReport}
          onCancel={() => setShowActionSheet(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Action sheet
// ---------------------------------------------------------------------------

interface ActionSheetProps {
  readonly playerName: string;
  readonly onBlock: () => void;
  readonly onReport: () => void;
  readonly onCancel: () => void;
}

function ActionSheet({
  playerName,
  onBlock,
  onReport,
  onCancel,
}: ActionSheetProps): React.ReactNode {
  return (
    <View
      testID="player-action-sheet"
      className="absolute inset-0 bg-black/50 justify-end"
    >
      <View className="mx-sm mb-[34px]">
        <View className="bg-white dark:bg-elevated rounded-[14px] overflow-hidden mb-sm">
          <View className="items-center px-lg py-md border-b border-border dark:border-border-strong">
            <Text className="text-sm font-bold text-text-default dark:text-content-primary">
              {playerName}
            </Text>
          </View>

          <Pressable
            testID="action-sheet-block"
            onPress={onBlock}
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-sm px-lg min-h-[56px] border-b border-border dark:border-border-strong active:opacity-70"
          >
            <Text className="text-[17px] text-blue-500">Block User</Text>
          </Pressable>

          <Pressable
            testID="action-sheet-report"
            onPress={onReport}
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-sm px-lg min-h-[56px] active:opacity-70"
          >
            <Text className="text-[17px] font-semibold text-red-500">Report User</Text>
          </Pressable>
        </View>

        <Pressable
          testID="action-sheet-cancel"
          onPress={onCancel}
          accessibilityRole="button"
          className="bg-white dark:bg-elevated rounded-[14px] min-h-[56px] items-center justify-center active:opacity-70"
        >
          <Text className="text-[17px] font-semibold text-blue-500">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
