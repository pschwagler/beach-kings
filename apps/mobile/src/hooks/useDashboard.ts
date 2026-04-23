import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  Player,
  League,
  Session,
  Court,
  FriendRequest,
  MatchRecord,
} from '@beach-kings/shared';
import { api } from '@/lib/api';

export const dashboardKeys = {
  root: ['dashboard'] as const,
  player: () => [...dashboardKeys.root, 'player'] as const,
  leagues: () => [...dashboardKeys.root, 'leagues'] as const,
  activeSession: () => [...dashboardKeys.root, 'activeSession'] as const,
  friendRequests: () =>
    [...dashboardKeys.root, 'friendRequests', 'received'] as const,
  courts: (locationId: string | null | undefined) =>
    [...dashboardKeys.root, 'courts', locationId ?? 'null'] as const,
  matches: (playerId: number | null | undefined) =>
    [...dashboardKeys.root, 'matches', playerId ?? 'none'] as const,
};

export interface DashboardSections {
  readonly player: UseQueryResult<Player | null, Error>;
  readonly leagues: UseQueryResult<readonly League[], Error>;
  readonly activeSession: UseQueryResult<Session | null, Error>;
  readonly friendRequests: UseQueryResult<readonly FriendRequest[], Error>;
  readonly courts: UseQueryResult<readonly Court[], Error>;
  readonly matches: UseQueryResult<readonly MatchRecord[], Error>;
}

export interface UseDashboardResult extends DashboardSections {
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly refetchAll: () => Promise<void>;
}

export function useDashboard(): UseDashboardResult {
  const queryClient = useQueryClient();

  const player = useQuery({
    queryKey: dashboardKeys.player(),
    queryFn: async (): Promise<Player | null> => {
      const result = await api.getCurrentUserPlayer();
      return result ?? null;
    },
  });

  const playerId = player.data?.id ?? null;
  const locationId = player.data?.location_id ?? null;

  const leagues = useQuery({
    queryKey: dashboardKeys.leagues(),
    queryFn: async (): Promise<readonly League[]> => {
      const result = await api.getUserLeagues();
      return result ?? [];
    },
  });

  const activeSession = useQuery({
    queryKey: dashboardKeys.activeSession(),
    queryFn: async (): Promise<Session | null> => {
      const result = await api.getActiveSession();
      return result ?? null;
    },
  });

  const friendRequests = useQuery({
    queryKey: dashboardKeys.friendRequests(),
    queryFn: async (): Promise<readonly FriendRequest[]> => {
      const result = await api.getFriendRequests('received');
      return result ?? [];
    },
  });

  const courts = useQuery({
    queryKey: dashboardKeys.courts(locationId),
    queryFn: async (): Promise<readonly Court[]> => {
      const result = await api.getCourts({ location_id: locationId });
      return result ?? [];
    },
    enabled: player.isSuccess,
  });

  const matches = useQuery({
    queryKey: dashboardKeys.matches(playerId),
    queryFn: async (): Promise<readonly MatchRecord[]> => {
      if (playerId == null) return [];
      const result = await api.getPlayerMatchHistory(playerId);
      return result ?? [];
    },
    enabled: player.isSuccess && playerId != null,
  });

  const refetchAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: dashboardKeys.root });
  }, [queryClient]);

  const isInitialLoading =
    player.isPending ||
    leagues.isPending ||
    activeSession.isPending ||
    friendRequests.isPending ||
    (player.isSuccess && (courts.isPending || matches.isPending));

  const isRefreshing =
    player.isFetching ||
    leagues.isFetching ||
    activeSession.isFetching ||
    friendRequests.isFetching ||
    courts.isFetching ||
    matches.isFetching;

  return useMemo<UseDashboardResult>(
    () => ({
      player,
      leagues,
      activeSession,
      friendRequests,
      courts,
      matches,
      isInitialLoading,
      isRefreshing,
      refetchAll,
    }),
    [
      player,
      leagues,
      activeSession,
      friendRequests,
      courts,
      matches,
      isInitialLoading,
      isRefreshing,
      refetchAll,
    ],
  );
}
