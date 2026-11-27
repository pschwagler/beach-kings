import React from 'react';
import { Alert, View } from 'react-native';
import Button from '@/components/ui/Button';
import { useLeagueArchiveMutation } from '@/features/leagues/useLeagueArchiveMutation';

interface LeagueArchiveActionProps {
  readonly leagueId: number | string;
  readonly archived: boolean;
}

export default function LeagueArchiveAction({
  leagueId,
  archived,
}: LeagueArchiveActionProps): React.ReactNode {
  const { mutateAsync, isPending } = useLeagueArchiveMutation(leagueId);
  const action = archived ? 'Reopen league' : 'Archive league';

  const confirm = (): void => {
    Alert.alert(
      `${action}?`,
      archived
        ? 'Members can record games again and new players can join.'
        : 'Members can still see past games and standings. New games and memberships are paused until you reopen the league.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          onPress: async () => {
            try {
              await mutateAsync(!archived);
            } catch {
              Alert.alert(
                archived ? 'Could not reopen league' : 'Could not archive league',
                'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View className="mx-4 mt-6">
      <Button
        title={action}
        variant="outline"
        disabled={isPending}
        loading={isPending}
        onPress={confirm}
      />
    </View>
  );
}
