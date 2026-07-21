import { useCallback, useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
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
import { useAuth } from '@/contexts/AuthContext';
import { socialKeys } from '@/features/social/keys';
import { socialQueries } from '@/features/social/queries';
import { privateKeys } from '@/infrastructure/query/keys';
import { leagueKeys } from '@/components/screens/Leagues/leagueKeys';
import { sessionKeys, sessionQueries } from '@/features/sessions';
import { matchKeys } from '@/features/matches';

export const dashboardKeys = {
  root: (userId: number) =>
    [...privateKeys.user(userId), 'dashboard'] as const,
  /** The current player is centralized in {@link useCurrentPlayer}. */
  player: (userId: number) => currentPlayerKeys.me(userId),
  leagues: (userId: number) => leagueKeys.userLeagues(userId),
  activeSession: (userId: number) => sessionKeys.open(userId),
  friendRequests: (userId: number) => socialKeys.requests(userId, 'incoming'),
  courts: (userId: number, locationId: string | null | undefined) =>
    [...dashboardKeys.root(userId), 'courts', locationId ?? 'null'] as const,
  matches: (userId: number, playerId: number | null | undefined) =>
    matchKeys.history(userId, playerId),
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
  const { user } = useAuth();
  const userId = user?.id ?? 0;

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
    queryKey: dashboardKeys.leagues(userId),
    queryFn: async (): Promise<readonly League[]> => {
      const result = await api.getUserLeagues();
      return result ?? [];
    },
    enabled: userId > 0,
  });

  const activeSession = useQuery({
    ...sessionQueries.open(userId),
    select: (sessions): Session | null => sessions[0] ?? null,
  });

  const friendRequests = useQuery(socialQueries.requests(userId, 'incoming'));

  const courts = useQuery({
    queryKey: dashboardKeys.courts(userId, courtsKey),
    queryFn: async (): Promise<readonly Court[]> => {
      const result = usePreciseCoords
        ? await api.getCourts({ user_lat: coords.latitude, user_lng: coords.longitude })
        : await api.getCourts({ location_id: locationId });
      return result ?? [];
    },
    enabled: player.isSuccess,
  });

  const matches = useQuery({
    queryKey: dashboardKeys.matches(userId, playerId),
    queryFn: async (): Promise<readonly MatchRecord[]> => {
      if (playerId == null) return [];
      const result = await api.getPlayerMatchHistory(playerId);
      return result ?? [];
    },
    enabled: player.isSuccess && playerId != null,
  });

  const refreshPlayer = player.refetch;
  const refreshLeagues = leagues.refetch;
  const refreshActiveSession = activeSession.refetch;
  const refreshFriendRequests = friendRequests.refetch;
  const refreshCourts = courts.refetch;
  const refreshMatches = matches.refetch;

  const refetchAll = useCallback(async () => {
    await Promise.allSettled([
      refreshPlayer(),
      refreshLeagues(),
      refreshActiveSession(),
      refreshFriendRequests(),
      refreshCourts(),
      refreshMatches(),
    ]);
  }, [
    refreshActiveSession,
    refreshCourts,
    refreshFriendRequests,
    refreshLeagues,
    refreshMatches,
    refreshPlayer,
  ]);

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
