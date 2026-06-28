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
import { useCurrentPlayer, currentPlayerKeys } from '@/hooks/useCurrentPlayer';
import { useResolvedUserLocation } from '@/hooks/useResolvedUserLocation';

export const dashboardKeys = {
  root: ['dashboard'] as const,
  /** The current player is centralized in {@link useCurrentPlayer}. */
  player: () => currentPlayerKeys.me(),
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

  const player = useCurrentPlayer();

  const playerId = player.data?.id ?? null;
  const locationId = player.data?.location_id ?? null;

  // Resolve the user's location without prompting for GPS on the home screen.
  // Use precise coordinates (device/city/home court) for distance-sorted
  // courts; fall back to the location_id filter for the hub-only case.
  const { coords, source } = useResolvedUserLocation({ skipDevice: true });
  const usePreciseCoords = coords != null && source !== 'hub';
  const courtsKey = usePreciseCoords
    ? `${coords.latitude},${coords.longitude}`
    : locationId;

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
    queryKey: dashboardKeys.courts(courtsKey),
    queryFn: async (): Promise<readonly Court[]> => {
      const result = usePreciseCoords
        ? await api.getCourts({ user_lat: coords.latitude, user_lng: coords.longitude })
        : await api.getCourts({ location_id: locationId });
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
    // The player lives under its own centralized key, so invalidate both.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dashboardKeys.root }),
      queryClient.invalidateQueries({ queryKey: currentPlayerKeys.me() }),
    ]);
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
