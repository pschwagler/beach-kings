/**
 * PendingInvitesScreen — View all league invites sent by the current user.
 *
 * Shows:
 *   Each invite as a card: league name, invited player (avatar + name),
 *   date sent, status badge (Pending / Accepted / Declined)
 *   Empty state when no invites exist
 *
 * Wireframe ref: league-pending-invites.html
 */

import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import { usePendingInvitesScreen } from './usePendingInvitesScreen';
import type { LeagueInviteItem } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function InviteStatusBadge({
  status,
}: {
  readonly status: LeagueInviteItem['status'];
}): React.ReactNode {
  const config: Record<
    LeagueInviteItem['status'],
    { label: string; wrapClass: string; textClass: string }
  > = {
    pending: {
      label: 'Pending',
      wrapClass: 'bg-warning-tint',
      textClass: 'text-warning',
    },
    accepted: {
      label: 'Joined',
      wrapClass: 'bg-success-tint',
      textClass: 'text-success',
    },
    declined: {
      label: 'Declined',
      wrapClass: 'bg-danger-tint',
      textClass: 'text-danger',
    },
  };

  const { label, wrapClass, textClass } = config[status];

  return (
    <View className={`rounded-[6px] px-2 py-[3px] ${wrapClass}`}>
      <Text className={`text-[11px] font-bold ${textClass}`}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Invite row
// ---------------------------------------------------------------------------

function InviteRow({ invite }: { readonly invite: LeagueInviteItem }): React.ReactNode {
  const dateLabel = new Date(invite.invited_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View
      testID={`invite-row-${invite.id}`}
      className="flex-row items-center bg-surface mx-4 mb-3 px-4 py-[14px] rounded-[12px] border border-divider gap-3"
    >
      {/* Avatar */}
      <View className="w-10 h-10 rounded-full bg-brand-teal items-center justify-center flex-shrink-0">
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
          {invite.display_name}
        </Text>
        <Text
          className="text-[12px] text-muted mt-[2px]"
          numberOfLines={1}
        >
          {invite.league_name}
        </Text>
        <Text className="text-[11px] text-tertiary mt-[2px]">
          Invited {dateLabel}
        </Text>
      </View>

      {/* Status */}
      <InviteStatusBadge status={invite.status} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

export default function PendingInvitesScreen(): React.ReactNode {
  const { invites, isLoading, isError } = usePendingInvitesScreen();

  const renderBody = (): React.ReactNode => {
    if (isLoading) {
      return (
        <View testID="pending-invites-loading" className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      );
    }

    if (isError) {
      return (
        <View
          testID="pending-invites-error"
          className="flex-1 items-center justify-center px-8"
        >
          <Text className="text-[16px] font-bold text-default text-center">
            Failed to load invites
          </Text>
        </View>
      );
    }

    if (invites.length === 0) {
      return (
        <View
          testID="pending-invites-empty"
          className="flex-1 items-center justify-center px-8"
        >
          <Text className="text-[20px] font-bold text-default mb-2 text-center">
            No Invites Sent
          </Text>
          <Text className="text-[14px] text-muted text-center">
            Invite players to your leagues from the league detail screen.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        testID="pending-invites-screen"
        data={invites}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <InviteRow invite={item} />}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 16 }}
      />
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Pending Invites" showBack />
      {renderBody()}
    </SafeAreaView>
  );
}
