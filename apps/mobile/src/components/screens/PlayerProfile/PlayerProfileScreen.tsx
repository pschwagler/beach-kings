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
 *   - Action sheet (report)
 *
 * Wireframe ref: player-profile.html
 */

import React, { useCallback, useState } from 'react';
import AppText from '@/components/ui/AppText';
import { AccessibilityInfo, Pressable, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { presentRelationship } from '@/features/social';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { usePlayerProfileScreen } from './usePlayerProfileScreen';
import PlayerProfileHeader from './PlayerProfileHeader';
import PlayerMutualFriends from './PlayerMutualFriends';
import PlayerStatsGrid from './PlayerStatsGrid';
import PlayerLeaguesList from './PlayerLeaguesList';
import PlayerProfileSkeleton from './PlayerProfileSkeleton';
import PlayerProfileErrorState from './PlayerProfileErrorState';
import ReportSheet from '@/components/moderation/ReportSheet';
import BlockPlayerDialog from '@/components/moderation/BlockPlayerDialog';
import PlayerSafetySheet from '@/components/moderation/PlayerSafetySheet';
import UnblockPlayerDialog from '@/components/moderation/UnblockPlayerDialog';
import { usePlayerSafety } from '@/features/moderation';

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
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showUnblockDialog, setShowUnblockDialog] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const numericPlayerId = typeof playerId === 'string' ? Number(playerId) : playerId;
  const safety = usePlayerSafety(numericPlayerId);

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
    isNotFound,
    isFriendActionLoading,
    onRefresh,
    isRefreshing,
    onAddFriend,
    onAcceptFriend,
    onDeclineFriend,
    onRemoveFriend,
    onMessage,
  } = usePlayerProfileScreen(playerId, navigateToMessages);

  const handleAddFriend = useCallback(() => {
    void hapticMedium();
    void onAddFriend();
  }, [onAddFriend]);

  const handleAcceptFriend = useCallback(() => {
    void hapticMedium();
    void onAcceptFriend();
  }, [onAcceptFriend]);

  const handleDeclineFriend = useCallback(() => {
    void hapticMedium();
    void onDeclineFriend();
  }, [onDeclineFriend]);

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

  const playerName =
    profileData != null
      ? [profileData.player.first_name, profileData.player.last_name]
          .filter(Boolean)
          .join(' ') || profileData.player.name || 'Player'
      : 'Player';
  const canRemoveFriend =
    profileData != null &&
    presentRelationship(profileData.friendStatus).canRemove;

  const handleRemoveFriend = useCallback(() => {
    setShowActionSheet(false);
    Alert.alert(
      'Remove Friend',
      `Remove ${playerName} from your friends? You can send another friend request later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void hapticMedium();
            void onRemoveFriend().catch(() => {
              Alert.alert(
                'Could Not Remove Friend',
                'Your friendship could not be removed. Check your connection and try again.',
              );
            });
          },
        },
      ],
    );
  }, [onRemoveFriend, playerName]);

  const handleReport = useCallback(() => {
    setShowActionSheet(false);
    setShowReportSheet(true);
  }, []);

  const handleBlock = useCallback(() => {
    setShowActionSheet(false);
    setSafetyError(null);
    if (safety.blockedByViewer) setShowUnblockDialog(true);
    else setShowBlockDialog(true);
  }, [safety.blockedByViewer]);

  const confirmBlock = useCallback(() => {
    setSafetyError(null);
    void safety.block.mutateAsync({
      player_id: numericPlayerId,
      full_name: playerName,
      avatar: profileData?.player.profile_picture_url ?? null,
    }).then(() => {
      setShowBlockDialog(false);
      AccessibilityInfo.announceForAccessibility(`${playerName} blocked.`);
    }).catch(() => setSafetyError('Could not block this player. Please try again.'));
  }, [numericPlayerId, playerName, profileData?.player.profile_picture_url, safety.block]);

  const confirmUnblock = useCallback(() => {
    setSafetyError(null);
    void safety.unblock.mutateAsync(numericPlayerId).then(() => {
      setShowUnblockDialog(false);
      AccessibilityInfo.announceForAccessibility(`${playerName} unblocked.`);
    }).catch(() => setSafetyError('Could not unblock this player. Please try again.'));
  }, [numericPlayerId, playerName, safety.unblock]);

  const rightAction = (
    <Pressable
      testID="player-more-btn"
      onPress={handleMorePress}
      accessibilityRole="button"
      accessibilityLabel="More options"
      className="min-w-touch min-h-touch items-center justify-center"
    >
      <AppText className="text-inverse text-xl">•••</AppText>
    </Pressable>
  );

  return (
    <SafeAreaView
      testID="player-profile-screen"
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Player" showBack rightAction={rightAction} />

      {isLoading && !isRefreshing ? (
        <PlayerProfileSkeleton />
      ) : error != null && !isRefreshing ? (
        <PlayerProfileErrorState onRetry={onRefresh} notFound={isNotFound} />
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
            onAcceptFriend={handleAcceptFriend}
            onDeclineFriend={handleDeclineFriend}
            onMessage={onMessage}
            interactionAvailable={safety.can('friend_request') && safety.can('direct_message')}
            blockedByViewer={safety.blockedByViewer}
            safetyPending={safety.isPending && safety.capability == null}
            onUnblock={() => setShowUnblockDialog(true)}
          />

          <PlayerMutualFriends mutualFriends={profileData.mutualFriends} />

          <PlayerStatsGrid player={profileData.player} />

          <PlayerLeaguesList
            leagues={profileData.leagues}
            onLeaguePress={handleLeaguePress}
          />
        </ScrollView>
      ) : null}

      {/* Action sheet overlay */}
      {showActionSheet && (
        <PlayerSafetySheet
          visible
          playerName={playerName}
          blockedByViewer={safety.blockedByViewer}
          onRemoveFriend={canRemoveFriend ? handleRemoveFriend : undefined}
          onReport={handleReport}
          onBlockChange={handleBlock}
          onClose={() => setShowActionSheet(false)}
        />
      )}
      {showReportSheet && (
        <ReportSheet
          targetType="player"
          targetId={numericPlayerId}
          onClose={() => setShowReportSheet(false)}
          onSubmitted={() => Alert.alert('Report received', 'Thank you for helping keep Beach League safe.')}
        />
      )}
      <BlockPlayerDialog
        visible={showBlockDialog}
        playerName={playerName}
        isPending={safety.block.isPending}
        errorMessage={safetyError}
        onConfirm={confirmBlock}
        onCancel={() => setShowBlockDialog(false)}
      />
      <UnblockPlayerDialog
        visible={showUnblockDialog}
        playerName={playerName}
        isPending={safety.unblock.isPending}
        errorMessage={safetyError}
        onConfirm={confirmUnblock}
        onCancel={() => setShowUnblockDialog(false)}
      />
    </SafeAreaView>
  );
}
