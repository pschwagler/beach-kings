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
 *   - edit mode (matchId provided) — pre-fills slots from session detail and
 *     calls api.updateMatch on submit instead of api.submitScoredGame
 *   - delete (matchId provided) — calls api.deleteMatch
 *
 * Roster source priority:
 *   1. sessionId → GET /api/sessions/:id/participants (+ friends appended)
 *   2. leagueId (only) → GET /api/leagues/:id/members (source='session')
 *   3. Neither → GET /api/friends (fallback)
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { shareLink } from '@/utils/share';
import type { SessionGame } from '@beach-kings/shared';

export type SubmitState = 'idle' | 'loading' | 'success' | 'error';
export type DeleteState = 'idle' | 'loading' | 'error';

export interface PlayerSlot {
  readonly player_id: number | null;
  readonly display_name: string;
  readonly initials: string;
  readonly is_guest?: boolean;
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
  /** Where this player came from — drives which section they appear in. */
  readonly source: 'session' | 'friend' | 'recent';
}

/** Context passed into the hook from the parent screen/route. */
export interface UseScoreGameScreenOptions {
  /** Existing session to add the game to. Null/undefined → backend creates a new session. */
  readonly sessionId?: number | null;
  /** League context — sets is_ranked default to true and drives roster source. */
  readonly leagueId?: number | null;
  /**
   * Season to attach a lazily-created league session to. Only used when both
   * `leagueId` is set and the user triggers a session create (via "Manage
   * Session" or by saving the first match).
   */
  readonly seasonId?: number | null;
  /**
   * Match id to edit. When provided, the hook fetches the session detail to
   * pre-fill slots/scores and routes submit through `api.updateMatch`.
   */
  readonly matchId?: number | null;
  /**
   * Logged-in player ID, used to mark the current user's chip with a "YOU"
   * badge in the picker. When omitted, the hook fetches it once via
   * `api.getCurrentUserPlayer()` on mount.
   */
  readonly currentPlayerId?: number | null;
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
  /** How many of the 4 slots are filled. */
  readonly filledCount: number;
  /** True while fewer than 4 slots are filled (picker shown, score hidden). */
  readonly isBuilding: boolean;
  /** The next empty slot to fill, scanning team1[0] → team1[1] → team2[0] → team2[1]. */
  readonly activeNextSlot: { readonly team: 1 | 2; readonly slot: 0 | 1 } | null;
  /** Inline validation warning to show near the save button. */
  readonly scoreWarning: string | null;
  /**
   * Logged-in player ID. Sourced from `options.currentPlayerId` when provided,
   * otherwise from `api.getCurrentUserPlayer()`. Null until the fetch resolves,
   * or permanently null if the fetch fails.
   */
  readonly currentPlayerId: number | null;
  /** True when `matchId` was provided — submit uses updateMatch, delete is enabled. */
  readonly isEditMode: boolean;
  /** State of the in-flight `onDelete` request. */
  readonly deleteState: DeleteState;
  /**
   * Current session id — initially `options.sessionId`, but updated when the
   * hook lazily creates a session (via `onManageSession` or `onSubmit`). The
   * screen uses this to decide where to navigate on close and whether the
   * Share menu option is available.
   */
  readonly sessionId: number | null;
  /** True when a "Manage Session" tap is awaiting backend session create. */
  readonly isCreatingSession: boolean;
  /** True when a session exists — drives Share menu visibility. */
  readonly canShare: boolean;
  /**
   * Lazily create a session if needed, then return its id. Resolves to null
   * if creation fails (errorMessage is populated for the caller to surface).
   */
  readonly onManageSession: () => Promise<number | null>;
  /**
   * Share the current session via the native share sheet. No-op when no
   * session exists.
   */
  readonly onShareSession: () => Promise<void>;
  readonly setScore1: (n: number) => void;
  readonly setScore2: (n: number) => void;
  readonly assignPlayer: (team: 1 | 2, slot: 0 | 1, player: RosterPlayer | null) => void;
  readonly removePlayer: (team: 1 | 2, slot: 0 | 1) => void;
  readonly setSearch: (q: string) => void;
  readonly setIsRanked: (ranked: boolean) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onDismissError: () => void;
  readonly onAddAnother: () => void;
  /**
   * Delete the current match. Resolves to `true` when the delete succeeded,
   * `false` when it failed (caller should stay on the screen so the user can
   * see the error) or there was nothing to delete.
   */
  readonly onDelete: () => Promise<boolean>;
}

/**
 * Pure helper — turn a `SessionGame` into the four-slot/score/is_ranked tuple
 * the hook uses to pre-fill state in edit mode. Names come from the game
 * payload directly; initials are derived from those names.
 */
export function deriveInitialSlots(game: SessionGame | null): {
  readonly team1: [PlayerSlot, PlayerSlot];
  readonly team2: [PlayerSlot, PlayerSlot];
  readonly score1: number;
  readonly score2: number;
  readonly isRanked: boolean;
} {
  if (game == null) {
    return {
      team1: [EMPTY_SLOT, EMPTY_SLOT],
      team2: [EMPTY_SLOT, EMPTY_SLOT],
      score1: 0,
      score2: 0,
      isRanked: false,
    };
  }
  const slot = (id: number | null, name: string): PlayerSlot =>
    id == null
      ? EMPTY_SLOT
      : { player_id: id, display_name: name, initials: toInitials(name) };
  return {
    team1: [
      slot(game.team1_player1_id, game.team1_player1_name),
      slot(game.team1_player2_id, game.team1_player2_name),
    ],
    team2: [
      slot(game.team2_player1_id, game.team2_player1_name),
      slot(game.team2_player2_id, game.team2_player2_name),
    ],
    score1: game.team1_score ?? 0,
    score2: game.team2_score ?? 0,
    isRanked: game.is_ranked ?? false,
  };
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
  const {
    sessionId: initialSessionId,
    leagueId,
    seasonId,
    matchId,
    currentPlayerId: currentPlayerIdOption,
  } = options;

  const isEditMode = matchId != null;

  // sessionId lives in state because lazy create (Manage Session / first
  // Save) may produce one mid-session. Initial value comes from the prop and
  // never resets on prop changes — the screen owns the lifecycle of the
  // session it's editing.
  const [sessionId, setSessionId] = useState<number | null>(
    initialSessionId ?? null,
  );

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
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // is_ranked defaults to true when a league context is present, false for
  // pickup. In edit mode we initialize to `false` and let the hydration effect
  // below overwrite it once the game loads — guessing `true` then snapping
  // back to `false` would visibly flip the toggle on slow networks.
  const [isRanked, setIsRanked] = useState<boolean>(
    matchId == null ? leagueId != null : false,
  );

  // --- Edit mode: pre-fill slots/scores from the matching game ---
  // Single source of truth: fetch session detail, find the game by matchId,
  // hydrate state. Keeping this in a one-shot effect (vs. param-encoding the
  // game) ensures the screen always shows current backend data.
  useEffect(() => {
    if (matchId == null || sessionId == null) return;
    let cancelled = false;
    void api
      .getSessionById(sessionId)
      .then((session) => {
        if (cancelled) return;
        const game = session.games.find((g) => g.id === matchId);
        if (game == null) return;
        const slots = deriveInitialSlots(game);
        setTeam1(slots.team1);
        setTeam2(slots.team2);
        setScore1(slots.score1);
        setScore2(slots.score2);
        setIsRanked(slots.isRanked);
      })
      .catch(() => {
        // Non-fatal — user can still edit manually if pre-fill fails.
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, sessionId]);

  // --- Current player ID for "YOU" badge ---
  // Prefer the explicit option; fall back to one-shot fetch from the API.
  const [fallbackCurrentPlayerId, setFallbackCurrentPlayerId] =
    useState<number | null>(null);

  useEffect(() => {
    if (currentPlayerIdOption != null) return;
    let cancelled = false;
    void api
      .getCurrentUserPlayer()
      .then((player) => {
        if (!cancelled && player != null && typeof player.id === 'number') {
          setFallbackCurrentPlayerId(player.id);
        }
      })
      .catch(() => {
        // Non-fatal — badge simply won't render
      });
    return () => {
      cancelled = true;
    };
  }, [currentPlayerIdOption]);

  const currentPlayerId =
    currentPlayerIdOption != null ? currentPlayerIdOption : fallbackCurrentPlayerId;

  // --- Roster ---
  const [roster, setRoster] = useState<RosterPlayer[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoster(): Promise<void> {
      try {
        if (sessionId != null) {
          // Priority 1: session participants (source='session') + friends appended
          const [participants, friendsResp] = await Promise.all([
            api.getSessionParticipants(sessionId),
            api.getFriends().catch(() => ({ items: [] })),
          ]);
          if (!cancelled) {
            const sessionPlayers: RosterPlayer[] = participants.map((p) => ({
              player_id: p.player_id,
              display_name: p.full_name,
              initials: toInitials(p.full_name),
              source: 'session' as const,
            }));
            const sessionIds = new Set(sessionPlayers.map((p) => p.player_id));
            const friendItems = (friendsResp as { items?: { player_id: number; full_name: string }[] })?.items ?? [];
            const friendPlayers: RosterPlayer[] = friendItems
              .filter((f) => !sessionIds.has(f.player_id))
              .map((f) => ({
                player_id: f.player_id,
                display_name: f.full_name,
                initials: toInitials(f.full_name),
                source: 'friend' as const,
              }));
            setRoster([...sessionPlayers, ...friendPlayers]);
          }
        } else if (leagueId != null) {
          // Priority 2: league members (source='session')
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
                    source: 'session' as const,
                  };
                },
              ),
            );
          }
        } else {
          // Fallback: friends list (source='friend')
          const response = await api.getFriends();
          if (!cancelled) {
            const items = response?.items ?? [];
            setRoster(
              items.map((f: { player_id: number; full_name: string }) => ({
                player_id: f.player_id,
                display_name: f.full_name,
                initials: toInitials(f.full_name),
                source: 'friend' as const,
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

  // --- Building mode derived state ---
  const filledCount = useMemo(
    () =>
      [team1[0], team1[1], team2[0], team2[1]].filter(
        (s) => s.player_id != null,
      ).length,
    [team1, team2],
  );

  const isBuilding = useMemo(() => filledCount < 4, [filledCount]);

  const activeNextSlot = useMemo<{
    readonly team: 1 | 2;
    readonly slot: 0 | 1;
  } | null>(() => {
    if (team1[0].player_id == null) return { team: 1, slot: 0 };
    if (team1[1].player_id == null) return { team: 1, slot: 1 };
    if (team2[0].player_id == null) return { team: 2, slot: 0 };
    if (team2[1].player_id == null) return { team: 2, slot: 1 };
    return null;
  }, [team1, team2]);

  const scoreWarning = useMemo<string | null>(() => {
    if (isBuilding) return null;
    if (score1 === 0 && score2 === 0) return 'Both scores are 0 — save anyway?';
    if (score1 === score2) return 'Scores are tied — beach volleyball has no ties';
    // Untied (handled above) + at least one non-zero (handled above) + both < 10
    if (score1 < 10 && score2 < 10) {
      return 'Scores look incomplete — save anyway?';
    }
    return null;
  }, [isBuilding, score1, score2]);

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
        setTeam1((prev) =>
          slot === 0 ? [newSlot, prev[1]] : [prev[0], newSlot],
        );
      } else {
        setTeam2((prev) =>
          slot === 0 ? [newSlot, prev[1]] : [prev[0], newSlot],
        );
      }
    },
    [],
  );

  const removePlayer = useCallback(
    (team: 1 | 2, slot: 0 | 1) => {
      assignPlayer(team, slot, null);
    },
    [assignPlayer],
  );

  // --- canSubmit ---
  const canSubmit = useMemo(
    () =>
      team1[0].player_id != null &&
      team1[1].player_id != null &&
      team2[0].player_id != null &&
      team2[1].player_id != null &&
      (score1 > 0 || score2 > 0),
    [team1, team2, score1, score2],
  );

  // --- Submit (create OR update) ---
  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitState('loading');
    setErrorMessage(null);
    try {
      if (matchId != null) {
        await api.updateMatch(matchId, {
          team1_player1_id: team1[0].player_id!,
          team1_player2_id: team1[1].player_id!,
          team2_player1_id: team2[0].player_id!,
          team2_player2_id: team2[1].player_id!,
          team1_score: score1,
          team2_score: score2,
          is_ranked: isRanked,
        });
        setLastSessionId(sessionId ?? null);
      } else {
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
        // Capture the session id the backend returned — for a brand-new
        // session this is what unlocks Share in the three-dot menu and
        // routes the close button to SessionDetail instead of Add Games.
        if (sessionId == null && response.session_id != null) {
          setSessionId(response.session_id);
        }
      }
      setSubmitState('success');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error occurred.';
      setErrorMessage(message);
      setSubmitState('error');
    }
  }, [
    canSubmit,
    matchId,
    sessionId,
    leagueId,
    team1,
    team2,
    score1,
    score2,
    isRanked,
  ]);

  // --- Delete (edit mode only) ---
  // Returns true on success so the screen can navigate away only when the
  // delete actually succeeded. Failures surface via deleteState='error' and
  // the shared errorMessage; the user stays on the screen to see the error.
  const onDelete = useCallback(async (): Promise<boolean> => {
    if (matchId == null) return false;
    setDeleteState('loading');
    setErrorMessage(null);
    try {
      await api.deleteMatch(matchId);
      setDeleteState('idle');
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not delete the game. Please try again.';
      setErrorMessage(message);
      setDeleteState('error');
      return false;
    }
  }, [matchId]);

  // --- Lazy session creation (Manage Session / Share) ---
  //
  // Validation doc Flows 2.3 and 4.3: tapping "Manage Session" before any
  // matches have been saved must create the session on demand. We POST to
  // /api/sessions; the backend routes through get-or-create when league_id
  // is provided so the call is idempotent for league flows.
  const ensureSession = useCallback(async (): Promise<number | null> => {
    if (sessionId != null) return sessionId;
    setIsCreatingSession(true);
    setErrorMessage(null);
    try {
      const created = await api.createSession({
        league_id: leagueId ?? null,
        season_id: seasonId ?? null,
      });
      const newId = created?.id ?? null;
      if (newId != null) setSessionId(newId);
      return newId;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not create a session. Please try again.';
      setErrorMessage(message);
      return null;
    } finally {
      setIsCreatingSession(false);
    }
  }, [sessionId, leagueId, seasonId]);

  const onManageSession = useCallback(async (): Promise<number | null> => {
    return ensureSession();
  }, [ensureSession]);

  const onShareSession = useCallback(async (): Promise<void> => {
    if (sessionId == null) return;
    try {
      const session = await api.getSessionById(sessionId);
      const code = session?.code ?? null;
      const message =
        code != null
          ? `Join my Beach Kings session — code: ${code}`
          : 'Join my Beach Kings session.';
      await shareLink(message, 'Share Session');
    } catch {
      // Silent: sharing is non-essential. The menu can be re-tapped.
    }
  }, [sessionId]);

  const canShare = sessionId != null;

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

  const onSubmitVoid = useCallback(() => {
    void onSubmit();
  }, [onSubmit]);

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
    filledCount,
    isBuilding,
    activeNextSlot,
    scoreWarning,
    currentPlayerId,
    isEditMode,
    deleteState,
    sessionId,
    isCreatingSession,
    canShare,
    onManageSession,
    onShareSession,
    setScore1,
    setScore2,
    assignPlayer,
    removePlayer,
    setSearch,
    setIsRanked,
    onSubmit: onSubmitVoid,
    onRetry,
    onDismissError,
    onAddAnother,
    onDelete,
  };
}
