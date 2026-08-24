/**
 * ReceivedInvitesScreen — View and respond to league invites received by the
 * current user.
 *
 * Shows:
 *   Each invite as a card: league name, inviter context, game count (if
 *   available), date received, and Accept / Decline action buttons.
 *   Responded invites are removed optimistically.
 *   Empty state when no pending invites exist.
 *
 * Wireframe ref: league-received-invites (mirrors PendingInvitesScreen layout)
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import { useReceivedInvitesScreen } from './useReceivedInvitesScreen';
import ReceivedInviteCard from './ReceivedInviteCard';
import SectionError from '@/components/home/SectionError';

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

export default function ReceivedInvitesScreen(): React.ReactNode {
  const {
    invites,
    isLoading,
    isError,
    respondingIds,
    onAccept,
    onDecline,
    onRetry,
  } = useReceivedInvitesScreen();

  const renderBody = (): React.ReactNode => {
    if (isLoading) {
      return (
        <View
          testID="received-invites-loading"
          className="flex-1 items-center justify-center"
        >
          <ActivityIndicator size="large" />
        </View>
      );
    }

    if (isError) {
      return (
        <View
          testID="received-invites-error"
          className="flex-1 items-center justify-center px-8"
        >
          <SectionError
            message="Failed to load invitations."
            onRetry={onRetry}
          />
        </View>
      );
    }

    if (invites.length === 0) {
      return (
        <View
          testID="received-invites-empty"
          className="flex-1 items-center justify-center px-8"
        >
          <AppText className="text-[20px] font-bold text-default mb-2 text-center">
            No Invitations
          </AppText>
          <AppText className="text-[14px] text-muted text-center">
            When someone invites you to their league, it will appear here.
          </AppText>
        </View>
      );
    }

    return (
      <FlatList
        testID="received-invites-screen"
        data={invites}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ReceivedInviteCard
            invite={item}
            isResponding={respondingIds.has(item.league_id)}
            onAccept={onAccept}
            onDecline={onDecline}
          />
        )}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 16 }}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav
        title="Invitations"
        showBack
      />
      {renderBody()}
    </SafeAreaView>
  );
}
