import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import SectionError from '@/components/home/SectionError';
import ReceivedInviteCard from './ReceivedInviteCard';
import { useReceivedInvitesScreen } from './useReceivedInvitesScreen';

interface ReceivedInvitesPreviewProps {
  readonly onViewAll: () => void;
}

export default function ReceivedInvitesPreview({
  onViewAll,
}: ReceivedInvitesPreviewProps): React.ReactNode {
  const { invites, isLoading, isError, respondingIds, onAccept, onDecline, onRetry } =
    useReceivedInvitesScreen();

  if (isLoading) {
    return (
      <View testID="received-invites-preview-loading" className="px-lg py-md bg-page">
        <ActivityIndicator accessibilityLabel="Loading invitations" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="px-lg py-md">
        <SectionError message="Could not load invitations." onRetry={onRetry} />
      </View>
    );
  }

  if (invites.length === 0) {
    return (
      <Pressable
        testID="received-invites-link"
        onPress={onViewAll}
        accessibilityRole="button"
        accessibilityLabel="Invitations"
        className="flex-row items-center justify-between px-lg py-sm bg-surface border-b border-divider active:opacity-70"
      >
        <AppText className="text-footnote font-medium text-default">
          Invitations Received
        </AppText>
        <AppText className="text-muted text-[12px]">›</AppText>
      </Pressable>
    );
  }

  return (
    <View testID="received-invites-preview" className="pt-md bg-page">
      <View className="flex-row items-center justify-between px-lg mb-sm">
        <AppText className="text-callout font-bold text-default">
          Invitations ({invites.length})
        </AppText>
        <Pressable
          testID="received-invites-view-all"
          onPress={onViewAll}
          accessibilityRole="button"
          accessibilityLabel={`View all ${invites.length} invitations`}
          className="min-h-touch justify-center px-sm active:opacity-70"
        >
          <AppText className="text-footnote font-semibold text-brand-teal">
            View All
          </AppText>
        </Pressable>
      </View>
      {invites.slice(0, 3).map((invite) => (
        <ReceivedInviteCard
          key={invite.id}
          invite={invite}
          isResponding={respondingIds.has(invite.league_id)}
          onAccept={onAccept}
          onDecline={onDecline}
        />
      ))}
    </View>
  );
}
