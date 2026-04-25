/**
 * Data hook for the League Matches (Games) tab.
 *
 * Fetches the current user's game history filtered by this league,
 * grouped into sessions for display.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { GameHistoryEntry } from '@beach-kings/shared';

const MATCHES_KEYS = {
  leagueGames: (leagueId: number | string) =>
    ['leagueGames', String(leagueId)] as const,
};

export interface SessionGroup {
  readonly session_id: number;
  readonly session_number: number | null;
  readonly games: readonly GameHistoryEntry[];
  readonly userWins: number;
  readonly userLosses: number;
  readonly ratingChange: number;
}

export interface UseLeagueMatchesTabResult {
  readonly sessions: readonly SessionGroup[];
  readonly isLoading: boolean;
  readonly isError: boolean;
}

function groupBySessions(games: readonly GameHistoryEntry[]): SessionGroup[] {
  const map = new Map<number, GameHistoryEntry[]>();
  for (const g of games) {
    const key = g.session_id;
    const existing = map.get(key) ?? [];
    map.set(key, [...existing, g]);
  }

  return Array.from(map.entries()).map(([sessionId, sessionGames], idx) => {
    const userWins = sessionGames.filter((g) => g.result === 'W').length;
    const userLosses = sessionGames.filter((g) => g.result === 'L').length;
    const ratingChange = sessionGames.reduce(
      (acc, g) => acc + (g.rating_change ?? 0),
      0,
    );

    return {
      session_id: sessionId,
      session_number: idx + 1,
      games: sessionGames,
      userWins,
      userLosses,
      ratingChange,
    };
  });
}

/**
 * Returns game history grouped by session for the league matches tab.
 */
export function useLeagueMatchesTab(leagueId: number | string): UseLeagueMatchesTabResult {
  const gamesQuery = useQuery({
    queryKey: MATCHES_KEYS.leagueGames(leagueId),
    queryFn: async () => {
      const response = await api.getMyGames({ league_id: Number(leagueId) });
      return response.games;
    },
  });

  const sessions = gamesQuery.data != null
    ? groupBySessions(gamesQuery.data)
    : [];

  return {
    sessions,
    isLoading: gamesQuery.isLoading,
    isError: gamesQuery.isError,
  };
}
