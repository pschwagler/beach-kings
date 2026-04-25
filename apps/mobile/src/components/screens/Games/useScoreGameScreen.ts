/**
 * Data hook for the Score Game modal screen.
 *
 * Manages:
 *   - team1 and team2 player slots (up to 2 each)
 *   - score inputs for each team
 *   - roster data for the picker (fetched from API based on context)
 *   - is_ranked toggle (defaults true for league games, false for pickup)
 *   - submit flow with loading / error / success states
 *   - onAddAnother — resets form while preserving session/league context
 *
 * Roster source priority:
 *   1. sessionId → GET /api/sessions/:id/participants
 *   2. leagueId (only) → GET /api/leagues/:id/members
 *   3. Neither → GET /api/friends (fallback)
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';

export type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export interface PlayerSlot {
  readonly player_id: number | null;
  readonly display_name: string;
  readonly initials: string;
}

const EMPTY_SLOT: PlayerSlot = {
  player_id: null,
  display_name: '',
  initials: '',
};

/** Minimal roster player shape used within this hook. */
export interface RosterPlayer {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
}

/** Context passed into the hook from the parent screen/route. */
export interface UseScoreGameScreenOptions {
  /** Existing session to add the game to. Null/undefined → backend creates a new session. */
  readonly sessionId?: number | null;
  /** League context — sets is_ranked default to true and drives roster source. */
  readonly leagueId?: number | null;
}

export interface UseScoreGameScreenResult {
  readonly team1: readonly [PlayerSlot, PlayerSlot];
  readonly team2: readonly [PlayerSlot, PlayerSlot];
  readonly score1: number;
  readonly score2: number;
  readonly roster: readonly RosterPlayer[];
  readonly search: string;
  readonly filteredRoster: readonly RosterPlayer[];
  readonly submitState: SubmitState;
  readonly errorMessage: string | null;
  readonly canSubmit: boolean;
  readonly isRanked: boolean;
  /** session_id returned by the last successful submit (new or existing). */
  readonly lastSessionId: number | null;
  readonly setScore1: (n: number) => void;
  readonly setScore2: (n: number) => void;
  readonly assignPlayer: (team: 1 | 2, slot: 0 | 1, player: RosterPlayer | null) => void;
  readonly setSearch: (q: string) => void;
  readonly setIsRanked: (ranked: boolean) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onDismissError: () => void;
  readonly onAddAnother: () => void;
}

/** Derive two-letter initials from a full name string. */
function toInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return (parts[0]?.[0] ?? '').toUpperCase();
  return (
    (parts[0]?.[0] ?? '').toUpperCase() +
    (parts[parts.length - 1]?.[0] ?? '').toUpperCase()
  );
}

export function useScoreGameScreen(
  options: UseScoreGameScreenOptions = {},
): UseScoreGameScreenResult {
  const { sessionId, leagueId } = options;

  // --- Form state ---
  const [team1, setTeam1] = useState<[PlayerSlot, PlayerSlot]>([
    EMPTY_SLOT,
    EMPTY_SLOT,
  ]);
  const [team2, setTeam2] = useState<[PlayerSlot, PlayerSlot]>([
    EMPTY_SLOT,
    EMPTY_SLOT,
  ]);
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [search, setSearch] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSessionId, setLastSessionId] = useState<number | null>(null);

  // is_ranked defaults to true when a league context is present, false for pickup.
  const [isRanked, setIsRanked] = useState<boolean>(
    leagueId != null && leagueId != undefined,
  );

  // --- Roster ---
  const [roster, setRoster] = useState<RosterPlayer[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoster(): Promise<void> {
      try {
        if (sessionId != null) {
          // Priority 1: session participants
          const participants = await api.getSessionParticipants(sessionId);
          if (!cancelled) {
            setRoster(
              participants.map((p) => ({
                player_id: p.player_id,
                display_name: p.full_name,
                initials: toInitials(p.full_name),
              })),
            );
          }
        } else if (leagueId != null) {
          // Priority 2: league members
          const members = await api.getLeagueMembers(leagueId);
          if (!cancelled) {
            const list = Array.isArray(members) ? members : [];
            setRoster(
              list.map(
                (m: { player_id: number; player_name?: string | null }) => {
                  const name = m.player_name ?? '';
                  return {
                    player_id: m.player_id,
                    display_name: name,
                    initials: toInitials(name),
                  };
                },
              ),
            );
          }
        } else {
          // Fallback: friends list
          const response = await api.getFriends();
          if (!cancelled) {
            const items = response?.items ?? [];
            setRoster(
              items.map((f: { player_id: number; full_name: string }) => ({
                player_id: f.player_id,
                display_name: f.full_name,
                initials: toInitials(f.full_name),
              })),
            );
          }
        }
      } catch {
        // Non-fatal — roster stays empty; user can still manually search
      }
    }

    void loadRoster();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, leagueId]);

  // --- Filtered roster ---
  const filteredRoster = useMemo(() => {
    if (search.trim() === '') return roster;
    const q = search.toLowerCase();
    return roster.filter((p) =>
      p.display_name.toLowerCase().includes(q),
    );
  }, [roster, search]);

  // --- Slot assignment ---
  const assignPlayer = useCallback(
    (team: 1 | 2, slot: 0 | 1, player: RosterPlayer | null) => {
      const newSlot: PlayerSlot =
        player != null
          ? {
              player_id: player.player_id,
              display_name: player.display_name,
              initials: player.initials,
            }
          : EMPTY_SLOT;

      if (team === 1) {
        setTeam1((prev) => {
          const next: [PlayerSlot, PlayerSlot] = [prev[0], prev[1]];
          next[slot] = newSlot;
          return next;
        });
      } else {
        setTeam2((prev) => {
          const next: [PlayerSlot, PlayerSlot] = [prev[0], prev[1]];
          next[slot] = newSlot;
          return next;
        });
      }
    },
    [],
  );

  // --- canSubmit ---
  const canSubmit =
    team1[0].player_id != null &&
    team1[1].player_id != null &&
    team2[0].player_id != null &&
    team2[1].player_id != null &&
    (score1 > 0 || score2 > 0);

  // --- Submit ---
  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitState('loading');
    setErrorMessage(null);
    try {
      const response = await api.submitScoredGame({
        session_id: sessionId ?? null,
        league_id: leagueId ?? null,
        team1_player1_id: team1[0].player_id!,
        team1_player2_id: team1[1].player_id!,
        team2_player1_id: team2[0].player_id!,
        team2_player2_id: team2[1].player_id!,
        team1_score: score1,
        team2_score: score2,
        is_ranked: isRanked,
      });
      setLastSessionId(response.session_id);
      setSubmitState('success');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error occurred.';
      setErrorMessage(message);
      setSubmitState('error');
    }
  }, [canSubmit, sessionId, leagueId, team1, team2, score1, score2, isRanked]);

  // --- Add Another Game ---
  const onAddAnother = useCallback(() => {
    setTeam1([EMPTY_SLOT, EMPTY_SLOT]);
    setTeam2([EMPTY_SLOT, EMPTY_SLOT]);
    setScore1(0);
    setScore2(0);
    setSearch('');
    setSubmitState('idle');
    setErrorMessage(null);
    // lastSessionId is preserved — the next submit will use it
    // sessionId from options is also unchanged (it's a closure param)
  }, []);

  // --- Retry / Dismiss ---
  const onRetry = useCallback(() => {
    setSubmitState('idle');
    setErrorMessage(null);
  }, []);

  const onDismissError = useCallback(() => {
    setSubmitState('idle');
    setErrorMessage(null);
  }, []);

  return {
    team1,
    team2,
    score1,
    score2,
    roster,
    search,
    filteredRoster,
    submitState,
    errorMessage,
    canSubmit,
    isRanked,
    lastSessionId,
    setScore1,
    setScore2,
    assignPlayer,
    setSearch,
    setIsRanked,
    onSubmit: () => {
      void onSubmit();
    },
    onRetry,
    onDismissError,
    onAddAnother,
  };
}
