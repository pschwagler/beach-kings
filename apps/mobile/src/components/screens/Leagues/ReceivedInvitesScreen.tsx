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
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import { routes } from '@/lib/navigation';
import { hapticMedium } from '@/utils/haptics';
import { useReceivedInvitesScreen } from './useReceivedInvitesScreen';
import type { LeagueInviteItem } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Invite row
// ---------------------------------------------------------------------------

interface InviteRowProps {
  readonly invite: LeagueInviteItem;
  readonly isResponding: boolean;
  readonly onAccept: (leagueId: number) => Promise<void>;
  readonly onDecline: (leagueId: number) => Promise<void>;
}

function InviteRow({
  invite,
  isResponding,
  onAccept,
  onDecline,
}: InviteRowProps): React.ReactNode {
  const dateLabel = new Date(invite.invited_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const gamesLabel =
    invite.game_count != null
      ? `${invite.game_count} game${invite.game_count !== 1 ? 's' : ''} played`
      : null;

  const handleAccept = (): void => {
    void hapticMedium();
    void onAccept(invite.league_id);
  };

  const handleDecline = (): void => {
    void hapticMedium();
    void onDecline(invite.league_id);
  };

  return (
    <View
      testID={`received-invite-row-${invite.id}`}
      className="bg-surface mx-4 mb-3 rounded-[12px] border border-divider overflow-hidden"
    >
      {/* Top section: league info */}
      <View className="flex-row items-center px-4 pt-[14px] pb-[10px] gap-3">
        {/* League avatar / initials */}
        <View className="w-10 h-10 rounded-full items-center justify-center flex-shrink-0 bg-brand-teal">
          <Text className="text-[11px] font-bold text-white">
            {invite.initials}
          </Text>
        </View>

        {/* Content */}
        <View className="flex-1 min-w-0">
          <Text
            className="text-[14px] font-semibold text-default"
            numberOfLines={1}
          >
            {invite.league_name}
          </Text>
          <Text className="text-[12px] text-muted mt-[2px]" numberOfLines={1}>
            Invited by {invite.display_name}
          </Text>
          {gamesLabel != null ? (
            <Text className="text-[11px] text-brand-teal mt-[2px]">
              {gamesLabel}
            </Text>
          ) : null}
          <Text className="text-[11px] text-tertiary mt-[2px]">
            {dateLabel}
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View className="flex-row border-t border-divider">
        <Pressable
          testID={`decline-invite-${invite.id}`}
          onPress={handleDecline}
          disabled={isResponding}
          accessibilityRole="button"
          accessibilityLabel={`Decline invite to ${invite.league_name}`}
          className={`flex-1 items-center justify-center py-[12px] border-r border-divider ${
            isResponding ? 'opacity-50' : 'active:opacity-70'
          }`}
        >
          {isResponding ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text className="text-[14px] font-semibold text-danger">
              Decline
            </Text>
          )}
        </Pressable>

        <Pressable
          testID={`accept-invite-${invite.id}`}
          onPress={handleAccept}
          disabled={isResponding}
          accessibilityRole="button"
          accessibilityLabel={`Accept invite to ${invite.league_name}`}
          className={`flex-1 items-center justify-center py-[12px] ${
            isResponding ? 'opacity-50' : 'active:opacity-80'
          }`}
        >
          {isResponding ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text className="text-[14px] font-bold text-brand-teal">
              Accept
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

export default function ReceivedInvitesScreen(): React.ReactNode {
  const { invites, isLoading, isError, respondingIds, onAccept, onDecline } =
    useReceivedInvitesScreen();

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
          <Text className="text-[16px] font-bold text-default text-center">
            Failed to load invitations
          </Text>
          <Text className="text-[13px] text-muted text-center mt-2">
            Pull to retry.
          </Text>
        </View>
      );
    }

    if (invites.length === 0) {
      return (
        <View
          testID="received-invites-empty"
          className="flex-1 items-center justify-center px-8"
        >
          <Text className="text-[20px] font-bold text-default mb-2 text-center">
            No Invitations
          </Text>
          <Text className="text-[14px] text-muted text-center">
            When someone invites you to their league, it will appear here.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        testID="received-invites-screen"
        data={invites}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <InviteRow
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
        backFallback={routes.leagues()}
      />
      {renderBody()}
    </SafeAreaView>
  );
}
