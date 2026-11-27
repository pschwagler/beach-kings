import React, { useState } from 'react';
import { View } from 'react-native';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useLeagueArchiveMutation } from '@/features/leagues/useLeagueArchiveMutation';

interface LeagueArchiveActionProps {
  readonly leagueId: number | string;
  readonly archived: boolean;
}

export default function LeagueArchiveAction({
  leagueId,
  archived,
}: LeagueArchiveActionProps): React.ReactNode {
  const [visible, setVisible] = useState(false);
  const { mutate, reset, isError, isPending } = useLeagueArchiveMutation(leagueId);
  const action = archived ? 'Reopen league' : 'Archive league';

  return (
    <View className="mx-4 mt-6">
      <Button
        title={action}
        variant="outline"
        onPress={() => {
          reset();
          setVisible(true);
        }}
      />
      <ConfirmDialog
        testID="archive-league-dialog"
        visible={visible}
        title={`${action}?`}
        message={archived
          ? 'Members can record games again and new players can join.'
          : 'Members can still see past games and standings. New games and memberships are paused until you reopen the league.'}
        confirmLabel={action}
        cancelLabel="Cancel"
        onConfirm={() => mutate(!archived, { onSuccess: () => setVisible(false) })}
        onCancel={() => setVisible(false)}
        isPending={isPending}
        errorMessage={isError ? `Could not ${action.toLowerCase()}. Please try again.` : null}
      />
    </View>
  );
}
