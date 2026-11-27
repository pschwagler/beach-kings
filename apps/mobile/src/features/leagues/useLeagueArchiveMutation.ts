import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { League, LeagueDetail, LeagueInfoDetail } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { leagueKeys } from './keys';

export function useLeagueArchiveMutation(leagueId: number | string) {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const client = useQueryClient();
  const rootKey = leagueKeys.root(userId);

  return useMutation({
    mutationKey: [...leagueKeys.league(userId, leagueId), 'archive'],
    mutationFn: (archived: boolean) =>
      api.updateLeague(Number(leagueId), { is_archived: archived }),
    onSuccess: async (league) => {
      await client.cancelQueries({ queryKey: rootKey });
      const is_archived = league.is_archived;
      client.setQueryData<LeagueDetail>(leagueKeys.detail(userId, leagueId),
        (old) => old && { ...old, is_archived });
      client.setQueryData<LeagueInfoDetail>(leagueKeys.info(userId, leagueId),
        (old) => old && { ...old, is_archived });
      client.setQueryData<readonly League[]>(leagueKeys.userLeagues(userId),
        (old) => old?.map((item) =>
          item.id === Number(leagueId) ? { ...item, is_archived } : item,
        ));
      void client.invalidateQueries({ queryKey: rootKey });
    },
  });
}
