/**
 * Data hook for the League Matches (Games) tab.
 *
 * Fetches the current user's game history filtered by this league.
 */

import { useQuery } from '@tanstack/react-query';
import { mockApi } from '@/lib/mockApi';
import type { GameHistoryEntry } from '@/lib/mockApi';

const MATCHES_KEYS = {
  leagueGames: (leagueId: number | string) =>
    ['leagueGames', String(leagueId)] as const,
};

export interface SessionGroup {
  readonly session_id: number | null;
  readonly date: string;
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

function groupBySessions(games: GameHistoryEntry[]): SessionGroup[] {
  const map = new Map<string, GameHistoryEntry[]>();
  for (const g of games) {
    const key = g.session_id != null ? String(g.session_id) : g.date;
    const existing = map.get(key) ?? [];
    map.set(key, [...existing, g]);
  }

  return Array.from(map.entries()).map(([, sessionGames], idx) => {
    const first = sessionGames[0];
    const userWins = sessionGames.filter((g) => g.result === 'win').length;
    const userLosses = sessionGames.filter((g) => g.result === 'loss').length;
    const ratingChange = sessionGames.reduce(
      (acc, g) => acc + (g.rating_change ?? 0),
      0,
    );

    return {
      session_id: first?.session_id ?? null,
      date: first?.date ?? '',
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
    queryFn: () =>
      mockApi.getMyGames({ league_id: Number(leagueId) }), // TODO(backend): GET /api/users/me/games?league_id=
  });

  const sessions = gamesQuery.data != null
    ? groupBySessions([...gamesQuery.data])
    : [];

  return {
    sessions,
    isLoading: gamesQuery.isLoading,
    isError: gamesQuery.isError,
  };
}
