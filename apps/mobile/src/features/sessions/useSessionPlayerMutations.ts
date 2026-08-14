import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from './keys';
import { sessionMutationOptions } from './mutations';

/** Session-roster writes and their shared cache reconciliation. */
export function useSessionPlayerMutations(userId: number, sessionId: number) {
  const queryClient = useQueryClient();

  const refreshRoster = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: sessionKeys.detail(userId, sessionId),
      }),
      queryClient.invalidateQueries({
        queryKey: sessionKeys.playerSearchRoot(userId, sessionId),
      }),
    ]);
  };

  const invitePlayer = useMutation({
    ...sessionMutationOptions.invitePlayer(userId, sessionId),
    onSuccess: refreshRoster,
  });
  const removePlayer = useMutation({
    ...sessionMutationOptions.removePlayer(userId, sessionId),
    onSuccess: refreshRoster,
  });

  return { invitePlayer, removePlayer } as const;
}
