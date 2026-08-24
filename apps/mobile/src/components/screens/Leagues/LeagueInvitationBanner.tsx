import React from 'react';
import { Pressable, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { hapticLight } from '@/utils/haptics';

interface LeagueInvitationBannerProps {
  readonly leagueName: string;
  readonly isResponding: boolean;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}

export default function LeagueInvitationBanner({
  leagueName,
  isResponding,
  onAccept,
  onDecline,
}: LeagueInvitationBannerProps): React.ReactNode {
  return (
    <View
      testID="league-invitation-banner"
      className="bg-surface px-lg py-md border-b border-divider gap-sm"
    >
      <View>
        <AppText
          accessibilityRole="header"
          className="text-callout font-bold text-default"
        >
          You’re invited
        </AppText>
        <AppText className="text-footnote text-muted mt-xs">
          Accept your invitation to join {leagueName}.
        </AppText>
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <Pressable
          testID="league-invitation-accept"
          disabled={isResponding}
          onPress={() => {
            void hapticLight();
            onAccept();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Accept invitation to ${leagueName}`}
          accessibilityState={{ disabled: isResponding }}
          className={`min-h-touch flex-1 min-w-[140px] items-center justify-center rounded-button bg-brand-teal px-lg ${
            isResponding ? 'opacity-50' : 'active:opacity-80'
          }`}
        >
          <AppText className="text-body font-bold text-on-brand-teal">
            {isResponding ? 'Responding…' : 'Accept Invitation'}
          </AppText>
        </Pressable>
        <Pressable
          testID="league-invitation-decline"
          disabled={isResponding}
          onPress={() => {
            void hapticLight();
            onDecline();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Decline invitation to ${leagueName}`}
          accessibilityState={{ disabled: isResponding }}
          className={`min-h-touch items-center justify-center rounded-button border border-divider px-lg ${
            isResponding ? 'opacity-50' : 'active:bg-page'
          }`}
        >
          <AppText className="text-body font-semibold text-default">
            Decline
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
