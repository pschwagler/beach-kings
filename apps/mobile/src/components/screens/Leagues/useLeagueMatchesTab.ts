/**
 * Data hook for the League Matches (Games) tab.
 *
 * Supports two views:
 *   - mode='mine': games where the current user played (My Games)
 *   - mode='all':  every game across every session in the league (All Games)
 *
 * Both views return SessionGroup[]. In 'mine' mode each group carries
 * user-relative game rows (W/L, your team perspective). In 'all' mode the
 * rows are team-neutral (team1 vs team2). The shared shape lets the card
 * render the right thing based on the SessionGroup.mode discriminator.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  GameHistoryEntry,
  LeagueGameEntry,
  SessionStatus,
} from '@beach-kings/shared';

const MATCHES_KEYS = {
  leagueMyGames: (leagueId: number | string) =>
    ['leagueGames', String(leagueId), 'mine'] as const,
  leagueAllGames: (leagueId: number | string) =>
    ['leagueGames', String(leagueId), 'all'] as const,
};

export type LeagueMatchesMode = 'mine' | 'all';

/** Common per-session card data. `mode` selects how rows are rendered. */
export interface SessionGroup {
  readonly session_id: number;
  readonly session_number: number | null;
  readonly session_date: string | null;
  readonly session_status: SessionStatus;
  readonly mode: LeagueMatchesMode;
  /** When mode='mine' these are user-relative GameHistoryEntry rows. */
  readonly myGames: readonly GameHistoryEntry[];
  /** When mode='all' these are team-neutral LeagueGameEntry rows. */
  readonly allGames: readonly LeagueGameEntry[];
  readonly userWins: number;
  readonly userLosses: number;
  /** Sum of rating_change across user games; 0 when mode='all'. */
  readonly ratingChange: number;
}

export interface UseLeagueMatchesTabResult {
  readonly mode: LeagueMatchesMode;
  readonly setMode: (mode: LeagueMatchesMode) => void;
  readonly sessions: readonly SessionGroup[];
  readonly myCount: number;
  readonly allCount: number;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortSessionsActiveFirstThenNewest(
  groups: readonly SessionGroup[],
): SessionGroup[] {
  return [...groups].sort((a, b) => {
    const aActive = a.session_status === 'ACTIVE';
    const bActive = b.session_status === 'ACTIVE';
    if (aActive !== bActive) return aActive ? -1 : 1;
    // Within the same group, newest first by session id.
    return b.session_id - a.session_id;
  });
}

// ---------------------------------------------------------------------------
// 'mine' mode grouping
// ---------------------------------------------------------------------------

function deriveStatusFromMyGames(games: readonly GameHistoryEntry[]): SessionStatus {
  // The /me/games endpoint only exposes session_submitted (boolean).
  // 'EDITED' is treated like SUBMITTED for display purposes.
  return games.some((g) => !g.session_submitted) ? 'ACTIVE' : 'SUBMITTED';
}

function groupMyGamesBySessions(
  games: readonly GameHistoryEntry[],
): SessionGroup[] {
  const map = new Map<number, GameHistoryEntry[]>();
  for (const g of games) {
    const existing = map.get(g.session_id) ?? [];
    map.set(g.session_id, [...existing, g]);
  }

  const groups: SessionGroup[] = Array.from(map.entries()).map(
    ([sessionId, sessionGames]) => {
      const userWins = sessionGames.filter((g) => g.result === 'W').length;
      const userLosses = sessionGames.filter((g) => g.result === 'L').length;
      const ratingChange = sessionGames.reduce(
        (acc, g) => acc + (g.rating_change ?? 0),
        0,
      );
      return {
        session_id: sessionId,
        session_number: null,
        session_date: sessionGames[0]?.session_date ?? null,
        session_status: deriveStatusFromMyGames(sessionGames),
        mode: 'mine' as const,
        myGames: sessionGames,
        allGames: [],
        userWins,
        userLosses,
        ratingChange,
      };
    },
  );

  const sorted = sortSessionsActiveFirstThenNewest(groups);
  // Number chronologically (oldest session = #1) while displaying newest-first,
  // so the count reads as "Nth session the league has played", not row order.
  return sorted.map((g, idx) => ({
    ...g,
    session_number: sorted.length - idx,
  }));
}

// ---------------------------------------------------------------------------
// 'all' mode grouping
// ---------------------------------------------------------------------------

function groupAllGamesBySessions(
  games: readonly LeagueGameEntry[],
): SessionGroup[] {
  const map = new Map<number, LeagueGameEntry[]>();
  for (const g of games) {
    const existing = map.get(g.session_id) ?? [];
    map.set(g.session_id, [...existing, g]);
  }

  const groups: SessionGroup[] = Array.from(map.entries()).map(
    ([sessionId, sessionGames]) => ({
      session_id: sessionId,
      session_number: null,
      session_date: sessionGames[0]?.session_date ?? null,
      session_status: sessionGames[0]?.session_status ?? 'SUBMITTED',
      mode: 'all' as const,
      myGames: [],
      allGames: sessionGames,
      userWins: 0,
      userLosses: 0,
      ratingChange: 0,
    }),
  );

  const sorted = sortSessionsActiveFirstThenNewest(groups);
  // Chronological numbering (oldest = #1), displayed newest-first — see mine grouping.
  return sorted.map((g, idx) => ({
    ...g,
    session_number: sorted.length - idx,
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns sessions for the league Games tab in the selected mode, plus
 * counts for both modes so the toggle can show "My Games · N" / "All Games · N".
 */
export function useLeagueMatchesTab(
  leagueId: number | string,
): UseLeagueMatchesTabResult {
  const [mode, setMode] = useState<LeagueMatchesMode>('mine');

  const myGamesQuery = useQuery({
    queryKey: MATCHES_KEYS.leagueMyGames(leagueId),
    queryFn: async () => {
      const response = await api.getMyGames({ league_id: Number(leagueId) });
      return response.games;
    },
  });

  // Only fetch league-wide data when the user has opened the All view.
  const allGamesQuery = useQuery({
    queryKey: MATCHES_KEYS.leagueAllGames(leagueId),
    queryFn: async () => {
      const response = await api.getLeagueGames(Number(leagueId));
      return response.games;
    },
    enabled: mode === 'all',
  });

  const mineGroups = useMemo(
    () => (myGamesQuery.data != null ? groupMyGamesBySessions(myGamesQuery.data) : []),
    [myGamesQuery.data],
  );
  const allGroups = useMemo(
    () => (allGamesQuery.data != null ? groupAllGamesBySessions(allGamesQuery.data) : []),
    [allGamesQuery.data],
  );

  const sessions = mode === 'mine' ? mineGroups : allGroups;
  const myCount = myGamesQuery.data?.length ?? 0;
  const allCount = allGamesQuery.data?.length ?? 0;

  // Loading: the active query is the one that gates the UI.
  const isLoading =
    mode === 'mine' ? myGamesQuery.isLoading : allGamesQuery.isLoading;
  const isError =
    mode === 'mine' ? myGamesQuery.isError : allGamesQuery.isError;

  return {
    mode,
    setMode,
    sessions,
    myCount,
    allCount,
    isLoading,
    isError,
  };
}
