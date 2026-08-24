import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import type { LeagueInviteItem } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import { hapticMedium } from '@/utils/haptics';

interface ReceivedInviteCardProps {
  readonly invite: LeagueInviteItem;
  readonly isResponding: boolean;
  readonly onAccept: (leagueId: number) => Promise<void>;
  readonly onDecline: (leagueId: number) => Promise<void>;
}

export default function ReceivedInviteCard({
  invite,
  isResponding,
  onAccept,
  onDecline,
}: ReceivedInviteCardProps): React.ReactNode {
  const dateLabel = new Date(invite.invited_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const gamesLabel =
    invite.game_count != null
      ? `${invite.game_count} game${invite.game_count !== 1 ? 's' : ''} played`
      : null;

  return (
    <View
      testID={`received-invite-row-${invite.id}`}
      className="bg-surface mx-4 mb-3 rounded-[12px] border border-divider overflow-hidden"
    >
      <View className="flex-row items-center px-4 pt-[14px] pb-[10px] gap-3">
        <View className="w-10 h-10 rounded-full items-center justify-center flex-shrink-0 bg-brand-teal">
          <AppText className="text-[11px] font-bold text-on-brand-teal">
            {invite.initials}
          </AppText>
        </View>
        <View className="flex-1 min-w-0">
          <AppText className="text-[14px] font-semibold text-default" numberOfLines={1}>
            {invite.league_name}
          </AppText>
          <AppText className="text-[12px] text-muted mt-[2px]" numberOfLines={1}>
            Invited by {invite.display_name}
          </AppText>
          {gamesLabel != null ? (
            <AppText className="text-[11px] text-brand-teal mt-[2px]">
              {gamesLabel}
            </AppText>
          ) : null}
          <AppText className="text-[11px] text-tertiary mt-[2px]">
            {dateLabel}
          </AppText>
        </View>
      </View>
      <View className="flex-row border-t border-divider">
        <Pressable
          testID={`decline-invite-${invite.id}`}
          onPress={() => {
            void hapticMedium();
            void onDecline(invite.league_id);
          }}
          disabled={isResponding}
          accessibilityRole="button"
          accessibilityLabel={`Decline invite to ${invite.league_name}`}
          className={`flex-1 items-center justify-center py-[12px] border-r border-divider ${
            isResponding ? 'opacity-50' : 'active:opacity-70'
          }`}
        >
          {isResponding ? <ActivityIndicator size="small" /> : (
            <AppText className="text-[14px] font-semibold text-danger">Decline</AppText>
          )}
        </Pressable>
        <Pressable
          testID={`accept-invite-${invite.id}`}
          onPress={() => {
            void hapticMedium();
            void onAccept(invite.league_id);
          }}
          disabled={isResponding}
          accessibilityRole="button"
          accessibilityLabel={`Accept invite to ${invite.league_name}`}
          className={`flex-1 items-center justify-center py-[12px] ${
            isResponding ? 'opacity-50' : 'active:opacity-80'
          }`}
        >
          {isResponding ? <ActivityIndicator size="small" /> : (
            <AppText className="text-[14px] font-bold text-brand-teal">Accept</AppText>
          )}
        </Pressable>
      </View>
    </View>
  );
}
