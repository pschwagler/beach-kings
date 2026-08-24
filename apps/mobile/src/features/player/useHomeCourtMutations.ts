import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlayerHomeCourt } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { courtKeys } from '@/features/courts/keys';
import { playerKeys } from './keys';

/** Query-backed replacement mutation for the owner's ordered home courts. */
export function useHomeCourtMutations(playerId: number) {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();

  const setHomeCourts = useMutation({
    mutationFn: (courtIds: readonly number[]) =>
      api.setPlayerHomeCourts(playerId, courtIds),
    onSuccess: (courts: PlayerHomeCourt[]) => {
      queryClient.setQueryData(
        playerKeys.homeCourts(userId, playerId),
        courts,
      );
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({
        queryKey: playerKeys.homeCourts(userId, playerId),
      }),
      queryClient.invalidateQueries({ queryKey: courtKeys.all(userId) }),
    ]),
  });

  return { setHomeCourts };
}
