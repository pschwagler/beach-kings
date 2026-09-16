import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { League, LeagueDetail } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { leagueKeys } from './keys';

/** Confirm departure on the server before changing membership anywhere. */
export function useLeaveLeagueMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  return useMutation({
    mutationKey: [...leagueKeys.root(userId), 'leave'],
    mutationFn: (leagueId: number) => api.leaveLeague(leagueId),
    onSuccess: async (_response, leagueId) => {
      await queryClient.cancelQueries({ queryKey: leagueKeys.root(userId) });
      // Patch only existing caches: late completion must not recreate cleared
      // account data, and a failed background refetch must not restore Leave.
      queryClient.setQueryData<LeagueDetail>(leagueKeys.detail(userId, leagueId),
        (old) => old == null ? old : { ...old, user_role: null, has_pending_request: false });
      queryClient.setQueryData<readonly League[]>(leagueKeys.userLeagues(userId),
        (old) => old?.filter((league) => league.id !== leagueId));
      // Includes Home's shared membership list, discovery, detail and info.
      void queryClient.invalidateQueries({ queryKey: leagueKeys.root(userId) });
    },
  });
}
