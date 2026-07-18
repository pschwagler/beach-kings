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
import { leagueKeys } from './leagueKeys';
import { useAuth } from '@/contexts/AuthContext';

export type LeagueMatchesMode = 'mine' | 'all';

/**
 * The subset of SessionStatus the "mine" view can represent. The /me/games
 * endpoint only exposes a `session_submitted` boolean, so we can distinguish
 * live (ACTIVE) from finalized (SUBMITTED) but not SUBMITTED vs EDITED — both
 * finalized states collapse to 'SUBMITTED'. See deriveStatusFromMyGames.
 */
type MineSessionStatus = Extract<SessionStatus, 'ACTIVE' | 'SUBMITTED'>;

/** Common per-session card data. `mode` selects how rows are rendered. */
export interface SessionGroup {
  readonly session_id: number;
  /** Play date (user-editable), ISO YYYY-MM-DD. Shown as the card header. */
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
  /** Number of the current user's games in the league (My Games badge). */
  readonly myGameCount: number;
  /** Number of games across the whole league (All Games badge). */
  readonly allGameCount: number;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

// ---------------------------------------------------------------------------
// Shared grouping + sorting
// ---------------------------------------------------------------------------

/**
 * Bucket a flat list of games into per-session arrays, preserving the input
 * order within each bucket. Shared by both the 'mine' and 'all' groupers.
 */
function groupBySessionId<T extends { readonly session_id: number }>(
  games: readonly T[],
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const g of games) {
    const existing = map.get(g.session_id);
    if (existing) {
      existing.push(g);
    } else {
      map.set(g.session_id, [g]);
    }
  }
  return map;
}

/** Active sessions first, then newest-first by session id within each group. */
function sortSessionsActiveFirstThenNewest(
  groups: readonly SessionGroup[],
): SessionGroup[] {
  return [...groups].sort((a, b) => {
    const aActive = a.session_status === 'ACTIVE';
    const bActive = b.session_status === 'ACTIVE';
    if (aActive !== bActive) return aActive ? -1 : 1;
    return b.session_id - a.session_id;
  });
}

// ---------------------------------------------------------------------------
// 'mine' mode grouping
// ---------------------------------------------------------------------------

function deriveStatusFromMyGames(
  games: readonly GameHistoryEntry[],
): MineSessionStatus {
  // The /me/games endpoint only exposes session_submitted (boolean), which the
  // backend sets true for every non-ACTIVE session (see my_games_service.py).
  // So any game still flagged not-submitted means the whole session is live.
  return games.some((g) => !g.session_submitted) ? 'ACTIVE' : 'SUBMITTED';
}

function groupMyGamesBySessions(
  games: readonly GameHistoryEntry[],
): SessionGroup[] {
  const groups: SessionGroup[] = Array.from(
    groupBySessionId(games).entries(),
  ).map(([sessionId, sessionGames]) => {
    const userWins = sessionGames.filter((g) => g.result === 'W').length;
    const userLosses = sessionGames.filter((g) => g.result === 'L').length;
    const ratingChange = sessionGames.reduce(
      (acc, g) => acc + (g.rating_change ?? 0),
      0,
    );
    return {
      session_id: sessionId,
      session_date: sessionGames[0]?.session_date ?? null,
      session_status: deriveStatusFromMyGames(sessionGames),
      mode: 'mine' as const,
      myGames: sessionGames,
      allGames: [],
      userWins,
      userLosses,
      ratingChange,
    };
  });

  return sortSessionsActiveFirstThenNewest(groups);
}

// ---------------------------------------------------------------------------
// 'all' mode grouping
// ---------------------------------------------------------------------------

function groupAllGamesBySessions(
  games: readonly LeagueGameEntry[],
): SessionGroup[] {
  const groups: SessionGroup[] = Array.from(
    groupBySessionId(games).entries(),
  ).map(([sessionId, sessionGames]) => ({
    session_id: sessionId,
    session_date: sessionGames[0]?.session_date ?? null,
    session_status: sessionGames[0]?.session_status ?? 'SUBMITTED',
    mode: 'all' as const,
    myGames: [],
    allGames: sessionGames,
    userWins: 0,
    userLosses: 0,
    ratingChange: 0,
  }));

  return sortSessionsActiveFirstThenNewest(groups);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns sessions for the league Games tab in the selected mode, plus game
 * counts for both modes so the toggle can show "My Games · N" / "All Games · N".
 */
export function useLeagueMatchesTab(
  leagueId: number | string,
): UseLeagueMatchesTabResult {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [mode, setMode] = useState<LeagueMatchesMode>('mine');

  const myGamesQuery = useQuery({
    queryKey: leagueKeys.myGames(userId, leagueId),
    queryFn: async () => {
      const response = await api.getMyGames({ league_id: Number(leagueId) });
      return response.games;
    },
    enabled: userId > 0,
  });

  // Only fetch league-wide data when the user has opened the All view.
  const allGamesQuery = useQuery({
    queryKey: leagueKeys.allGames(userId, leagueId),
    queryFn: async () => {
      const response = await api.getLeagueGames(Number(leagueId));
      return response.games;
    },
    enabled: userId > 0 && mode === 'all',
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
  const myGameCount = myGamesQuery.data?.length ?? 0;
  const allGameCount = allGamesQuery.data?.length ?? 0;

  // Loading: the active query is the one that gates the UI.
  const isLoading =
    mode === 'mine' ? myGamesQuery.isLoading : allGamesQuery.isLoading;
  const isError =
    mode === 'mine' ? myGamesQuery.isError : allGamesQuery.isError;

  return {
    mode,
    setMode,
    sessions,
    myGameCount,
    allGameCount,
    isLoading,
    isError,
  };
}
