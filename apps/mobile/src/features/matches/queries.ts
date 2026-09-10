import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { matchKeys } from './keys';

/** Endpoint-shaped game history, separate from player match-history payloads. */
export const matchQueries = {
  myGames: (userId: number, leagueId: number | null, result?: 'W' | 'L') => queryOptions({
    queryKey: matchKeys.myGames(userId, leagueId, result),
    queryFn: ({ signal }) => api.getMyGames({ league_id: leagueId ?? undefined, result }, { signal }),
    enabled: userId > 0,
    staleTime: 30_000,
  }),
};
