/**
 * Data hook for the Score Game modal screen.
 *
 * Manages:
 *   - team1 and team2 player slots (up to 2 each)
 *   - score inputs for each team
 *   - Query-backed roster data composed for the picker
 *   - is_ranked — derived from context: league sessions are ranked by default,
 *     pickup sessions are unranked. In edit mode, the persisted game value is
 *     hydrated from session detail. Session-level is_ranked is set at session
 *     creation time (SessionCreateScreen) and inherited here.
 *   - submit flow with loading / error / success states
 *   - onAddAnother — resets form while preserving session/league context
 *   - edit mode (matchId provided) — pre-fills slots from session detail and
 *     uses the shared match mutation contracts
 *   - delete (matchId provided) through the shared match mutation contract
 *
 * Server data is owned by the session, league, player, social, and match
 * feature modules. This hook keeps only form and interaction state locally.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { routes } from "@/lib/navigation";
import { useAddNewPlayer } from "@/contexts/AddNewPlayerContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  matchMutationOptions,
  reconcileGameMutation,
} from "@/features/matches";
import { sessionQueries, shareSessionInvitation } from "@/features/sessions";
import { leagueQueries } from "@/features/leagues";
import { playerQueries } from "@/features/player";
import { socialQueries } from "@/features/social";
import useDebounce from "@/hooks/useDebounce";
import { formatLocalCalendarDate } from "@/lib/calendarDate";
import type {
  PlayerGender,
  SkillLevel,
  Player,
  StatsJobIds,
} from "@beach-kings/shared";
import { SKILL_LEVEL_OPTIONS, validateMatchScore } from "@beach-kings/shared";
import {
  EMPTY_SLOT,
  buildFallbackRoster,
  deriveInitialSlots,
  inferGenderLevel,
  mapSearchItem,
  toInitials,
  type DeleteState,
  type PlayerSlot,
  type RosterPlayer,
  type SubmitState,
  type UseScoreGameScreenOptions,
  type UseScoreGameScreenResult,
} from "./scoreGameModel";

export { deriveInitialSlots } from "./scoreGameModel";
export type {
  DeleteState,
  PlayerSlot,
  RosterPlayer,
  SubmitState,
  UseScoreGameScreenOptions,
  UseScoreGameScreenResult,
} from "./scoreGameModel";

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

  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const addNewPlayerBridge = useAddNewPlayer();

  // sessionId lives in state because the first Save may produce one
  // atomically with the game. Initial value comes from the prop and
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
  const [search, setSearch] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSessionId, setLastSessionId] = useState<number | null>(null);
  const [savedMatchId, setSavedMatchId] = useState<number | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const debouncedSearch = useDebounce(search, 250);

  const sessionDetailQuery = useQuery(
    sessionQueries.detail(userId, sessionId ?? 0, sessionId != null),
  );
  const participantsQuery = useQuery(
    sessionQueries.participants(userId, sessionId ?? 0, sessionId != null),
  );
  const rosterQuery = useQuery(
    sessionQueries.playerSearch(userId, sessionId, "", leagueId),
  );
  const searchQuery = useQuery(
    sessionQueries.playerSearch(
      userId,
      sessionId,
      debouncedSearch,
      leagueId,
      debouncedSearch.trim() !== "",
    ),
  );
  const friendsQuery = useQuery(
    socialQueries.friends(
      userId,
      rosterQuery.isFetched && (rosterQuery.data?.items.length ?? 0) === 0,
    ),
  );
  const leagueQuery = useQuery(
    leagueQueries.detail(userId, leagueId ?? 0, leagueId != null),
  );
  const currentPlayerQuery = useQuery(
    playerQueries.me(userId, currentPlayerIdOption == null),
  );
  const createMatch = useMutation(matchMutationOptions.create(userId));
  const updateMatch = useMutation(
    matchMutationOptions.update(userId, matchId ?? 0),
  );
  const deleteMatch = useMutation(
    matchMutationOptions.remove(userId, matchId ?? 0),
  );

  // --- AddNewPlayer formSheet state ---
  // Gender/level inference is derived below from Query-owned server data and
  // handed to AddNewPlayerContext when `openAddNewPlayer` navigates.
  const [pendingShareInvite, setPendingShareInvite] = useState<{
    readonly name: string;
    readonly invite_url: string;
    readonly team: 1 | 2;
  } | null>(null);

  // is_ranked is derived from context. When a session is in context, the
  // session's own is_ranked flag (set at creation time) drives the value —
  // fetched below. For pickup with no session, fall back to false. In edit
  // mode we start false and let the session-detail hydration effect below set
  // the actual persisted per-game value.
  const [isRanked, setIsRanked] = useState<boolean>(
    matchId == null ? leagueId != null : false,
  );

  // Hydrate form-only state from the canonical session-detail query.
  useEffect(() => {
    const session = sessionDetailQuery.data;
    if (session == null) return;
    if (matchId == null) {
      if (session.is_ranked != null) setIsRanked(session.is_ranked);
      return;
    }
    const game = session.games.find((candidate) => candidate.id === matchId);
    if (game == null) return;
    const slots = deriveInitialSlots(game);
    setTeam1(slots.team1);
    setTeam2(slots.team2);
    setScore1(slots.score1);
    setScore2(slots.score2);
    setIsRanked(slots.isRanked);
  }, [matchId, sessionDetailQuery.data]);

  const currentUserPlayer: Player | null = currentPlayerQuery.data ?? null;

  const currentPlayerId =
    currentPlayerIdOption != null
      ? currentPlayerIdOption
      : (currentUserPlayer?.id ?? null);

  // The logged-in player shaped for the picker. `isSession: true` makes it
  // render as a compact chip that leads the list; RosterPicker stamps the
  // gold "YOU" badge via the existing `currentPlayerId` path. Null until the
  // fetch resolves, or when only an id option was supplied (no name/avatar).
  const selfRosterPlayer = useMemo<RosterPlayer | null>(() => {
    const p = currentUserPlayer;
    if (p == null) return null;
    const name = p.full_name ?? p.name ?? "You";
    return {
      player_id: p.id,
      display_name: name,
      initials: toInitials(name),
      tags: [],
      isSession: true,
      is_guest: false,
      avatar_url: p.profile_picture_url ?? null,
    };
  }, [currentUserPlayer]);

  // --- Roster ---
  const participants = useMemo(
    () => participantsQuery.data ?? [],
    [participantsQuery.data],
  );
  const roster = useMemo<RosterPlayer[]>(() => {
    const searchItems = rosterQuery.data?.items ?? [];
    return searchItems.length > 0
      ? searchItems.map(mapSearchItem)
      : buildFallbackRoster(participants, friendsQuery.data ?? []);
  }, [friendsQuery.data, participants, rosterQuery.data?.items]);

  // Session inference is derived from cached participants; league metadata
  // takes precedence when it provides an explicit value.
  const inferredFromParticipants = useMemo(
    () => inferGenderLevel(participants),
    [participants],
  );
  const { inferredGender, inferredLevel } = useMemo(() => {
    const validLevels = new Set<string>(
      SKILL_LEVEL_OPTIONS.map((o) => o.value),
    );
    const league = leagueQuery.data;
    const leagueGender: PlayerGender | null =
      league?.gender === "mens"
        ? "male"
        : league?.gender === "womens"
          ? "female"
          : null;
    const leagueLevel: SkillLevel | null =
      league?.level != null && validLevels.has(league.level)
        ? (league.level as SkillLevel)
        : null;
    return {
      inferredGender: leagueGender ?? inferredFromParticipants.gender ?? null,
      inferredLevel: leagueLevel ?? inferredFromParticipants.level ?? null,
    };
  }, [inferredFromParticipants, leagueQuery.data]);

  const searchResults = useMemo(
    () =>
      debouncedSearch.trim() === ""
        ? []
        : (searchQuery.data?.items ?? []).map(mapSearchItem),
    [debouncedSearch, searchQuery.data?.items],
  );
  const isSearching =
    search.trim() !== "" &&
    (debouncedSearch !== search || searchQuery.isFetching);

  // --- Seated player IDs (those already on a team) ---
  // Seated players are shown on the scoreboard with their team — repeating
  // them in the picker just steals scroll space from the search results.
  const seatedPlayerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const slot of [team1[0], team1[1], team2[0], team2[1]]) {
      if (slot.player_id != null) ids.add(slot.player_id);
    }
    return ids;
  }, [team1, team2]);

  // --- Filtered roster ---
  // Empty search           → pre-loaded roster (session + friends/league).
  // Backend results ready  → backend search (so the user can find anyone).
  // Backend not back yet   → local filter of the pre-loaded roster as a
  //   stopgap so the picker isn't blank during the debounce window.
  // In every case, exclude already-seated players to free up real estate.
  const filteredRoster = useMemo(() => {
    const trimmed = search.trim();
    const q = trimmed.toLowerCase();
    const base =
      trimmed === ""
        ? roster.filter((p) => !seatedPlayerIds.has(p.player_id))
        : searchResults.length > 0
          ? searchResults.filter((p) => !seatedPlayerIds.has(p.player_id))
          : roster.filter(
              (p) =>
                !seatedPlayerIds.has(p.player_id) &&
                p.display_name.toLowerCase().includes(q),
            );

    // Seat the caller themselves at the head of the picker — the backend
    // relevance search excludes them by design, but the person logging the
    // game is almost always in it. Skipped once they're on a team (the
    // scoreboard already shows them there) and, while searching, only when
    // their own name matches the query. Deduped so a self that also came
    // back via session/league membership isn't listed twice.
    const self = selfRosterPlayer;
    if (self == null || seatedPlayerIds.has(self.player_id)) return base;
    const matchesQuery =
      q === "" || self.display_name.toLowerCase().includes(q);
    if (!matchesQuery) return base;
    return [self, ...base.filter((p) => p.player_id !== self.player_id)];
  }, [roster, searchResults, search, seatedPlayerIds, selfRosterPlayer]);

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

  const scoreValidation = useMemo(
    () => validateMatchScore(score1, score2),
    [score1, score2],
  );

  const scoreWarning = useMemo<string | null>(() => {
    if (isBuilding) return null;
    if (!scoreValidation.isValid) return scoreValidation.errorMessage;
    if (score1 < 10 && score2 < 10) {
      return "Scores look incomplete — save anyway?";
    }
    return null;
  }, [isBuilding, score1, score2, scoreValidation]);

  const scoreWarningKind = useMemo<"error" | "warning" | null>(() => {
    if (scoreWarning == null) return null;
    return scoreValidation.isValid ? "warning" : "error";
  }, [scoreValidation.isValid, scoreWarning]);

  // --- Slot assignment ---
  const assignPlayer = useCallback(
    (team: 1 | 2, slot: 0 | 1, player: RosterPlayer | null) => {
      const newSlot: PlayerSlot =
        player != null
          ? {
              player_id: player.player_id,
              display_name: player.display_name,
              initials: player.initials,
              ...(player.is_guest != null ? { is_guest: player.is_guest } : {}),
              avatar_url: player.avatar_url ?? null,
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

  const swapSlots = useCallback(
    (
      from: { team: 1 | 2; slot: 0 | 1 },
      to: { team: 1 | 2; slot: 0 | 1 },
    ): void => {
      if (from.team === to.team && from.slot === to.slot) return;

      const fromSlot = from.team === 1 ? team1[from.slot] : team2[from.slot];
      const toSlot = to.team === 1 ? team1[to.slot] : team2[to.slot];

      if (from.team === 1 && to.team === 1) {
        setTeam1(() =>
          from.slot === 0 ? [toSlot, fromSlot] : [fromSlot, toSlot],
        );
        return;
      }
      if (from.team === 2 && to.team === 2) {
        setTeam2(() =>
          from.slot === 0 ? [toSlot, fromSlot] : [fromSlot, toSlot],
        );
        return;
      }
      if (from.team === 1) {
        setTeam1((prev) =>
          from.slot === 0 ? [toSlot, prev[1]] : [prev[0], toSlot],
        );
        setTeam2((prev) =>
          to.slot === 0 ? [fromSlot, prev[1]] : [prev[0], fromSlot],
        );
      } else {
        setTeam2((prev) =>
          from.slot === 0 ? [toSlot, prev[1]] : [prev[0], toSlot],
        );
        setTeam1((prev) =>
          to.slot === 0 ? [fromSlot, prev[1]] : [prev[0], fromSlot],
        );
      }
    },
    [team1, team2],
  );

  // --- canSubmit ---
  const canSubmit = useMemo(
    () =>
      team1[0].player_id != null &&
      team1[1].player_id != null &&
      team2[0].player_id != null &&
      team2[1].player_id != null &&
      scoreValidation.isValid,
    [team1, team2, scoreValidation.isValid],
  );

  // --- Submit (create OR update) ---
  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitState("loading");
    setErrorMessage(null);
    try {
      let statsJobs: StatsJobIds | undefined;
      if (matchId != null) {
        statsJobs = await updateMatch.mutateAsync({
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
        const response = await createMatch.mutateAsync({
          session_id: sessionId ?? null,
          league_id: leagueId ?? null,
          season_id: seasonId ?? null,
          ...(sessionId == null ? { date: formatLocalCalendarDate() } : {}),
          team1_player1_id: team1[0].player_id!,
          team1_player2_id: team1[1].player_id!,
          team2_player1_id: team2[0].player_id!,
          team2_player2_id: team2[1].player_id!,
          team1_score: score1,
          team2_score: score2,
          is_ranked: isRanked,
        });
        setLastSessionId(response.session_id);
        setSavedMatchId(response.match_id);
        statsJobs = response;
        // Capture the session id the backend returned — for a brand-new
        // session this is what unlocks Share in the three-dot menu and
        // routes the close button to SessionDetail instead of Add Games.
        if (sessionId == null && response.session_id != null) {
          setSessionId(response.session_id);
        }
      }
      void reconcileGameMutation(queryClient, {
        userId,
        leagueId,
        statsJobs,
      });
      setSubmitState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error occurred.";
      setErrorMessage(message);
      setSubmitState("error");
    }
  }, [
    canSubmit,
    matchId,
    sessionId,
    leagueId,
    seasonId,
    team1,
    team2,
    score1,
    score2,
    isRanked,
    queryClient,
    userId,
    createMatch,
    updateMatch,
  ]);

  // --- Delete (edit mode only) ---
  // Returns true on success so the screen can navigate away only when the
  // delete actually succeeded. Failures surface via deleteState='error' and
  // the shared errorMessage; the user stays on the screen to see the error.
  const onDelete = useCallback(async (): Promise<boolean> => {
    if (matchId == null) return false;
    setDeleteState("loading");
    setErrorMessage(null);
    try {
      const response = await deleteMatch.mutateAsync();
      void reconcileGameMutation(queryClient, {
        userId,
        leagueId,
        statsJobs: response,
      });
      setDeleteState("idle");
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not delete the game. Please try again.";
      setErrorMessage(message);
      setDeleteState("error");
      return false;
    }
  }, [deleteMatch, leagueId, matchId, queryClient, userId]);

  const onShareSession = useCallback(async (): Promise<void> => {
    if (sessionId == null) return;
    try {
      const session = await queryClient.ensureQueryData(
        sessionQueries.detail(userId, sessionId),
      );
      await shareSessionInvitation(session?.code);
    } catch {
      setErrorMessage(
        "Could not share this session. Check your connection and try again.",
      );
    }
  }, [queryClient, sessionId, userId]);

  const canShare = sessionId != null;

  // --- Add Another Game ---
  const onAddAnother = useCallback(() => {
    setTeam1([EMPTY_SLOT, EMPTY_SLOT]);
    setTeam2([EMPTY_SLOT, EMPTY_SLOT]);
    setScore1(0);
    setScore2(0);
    setSearch("");
    setSubmitState("idle");
    setErrorMessage(null);
    // lastSessionId is preserved — the next submit will use it
  }, []);

  // --- Retry / Dismiss ---
  const onRetry = useCallback(() => {
    setSubmitState("idle");
    setErrorMessage(null);
  }, []);

  const onDismissError = useCallback(() => {
    setSubmitState("idle");
    setErrorMessage(null);
  }, []);

  const onSubmitVoid = useCallback(() => {
    void onSubmit();
  }, [onSubmit]);

  // --- AddNewPlayer formSheet handlers ---

  const { result: addNewPlayerResult, setRequest: setAddNewPlayerRequest } =
    addNewPlayerBridge;
  const consumeAddNewPlayerResult = addNewPlayerBridge.consumeResult;

  /**
   * Navigate to the add-new-player formSheet for the given target slot. The
   * current search string + inferred gender/level ride along via context;
   * the created player comes back through the result-consumption effect below.
   */
  const openAddNewPlayer = useCallback(
    (target: { team: 1 | 2; slot: 0 | 1 }) => {
      setAddNewPlayerRequest({
        team: target.team,
        slot: target.slot,
        prefillName: search,
        inferredGender,
        inferredLevel,
        leagueId: leagueId ?? null,
      });
      router.push(routes.addNewPlayer());
    },
    [
      setAddNewPlayerRequest,
      router,
      search,
      inferredGender,
      inferredLevel,
      leagueId,
    ],
  );

  /** Dismiss the pending share invite (drives ScoreboardToast dismiss). */
  const clearPendingShareInvite = useCallback(() => {
    setPendingShareInvite(null);
  }, []);

  // When the formSheet returns a created placeholder, seat them into the
  // requested slot and stash the invite for the ScoreboardToast. Consuming
  // the result clears it, so this runs exactly once per created player.
  useEffect(() => {
    if (addNewPlayerResult == null) return;
    const consumed = consumeAddNewPlayerResult();
    if (consumed == null) return;
    const guestPlayer: RosterPlayer = {
      player_id: consumed.player_id,
      display_name: consumed.name,
      initials: toInitials(consumed.name),
      tags: [],
      isSession: false,
      is_guest: true,
      avatar_url: null,
    };
    assignPlayer(consumed.team, consumed.slot, guestPlayer);
    setPendingShareInvite({
      name: consumed.name,
      invite_url: consumed.invite_url,
      team: consumed.team,
    });
    setSearch("");
  }, [addNewPlayerResult, consumeAddNewPlayerResult, assignPlayer]);

  // react-native-screens freezes the score-game screen's React tree while the
  // formSheet is open, so the setResultState() call above never propagates and
  // the useEffect above never fires. consumeResult() reads the synchronously-set
  // resultRef, so it reliably captures the result even when state was frozen.
  // This fires when the screen regains focus (formSheet dismissed); it's
  // idempotent — if the useEffect above already consumed the result it no-ops.
  useFocusEffect(
    useCallback(() => {
      const consumed = consumeAddNewPlayerResult();
      if (consumed == null) return;
      const guestPlayer: RosterPlayer = {
        player_id: consumed.player_id,
        display_name: consumed.name,
        initials: toInitials(consumed.name),
        tags: [],
        isSession: false,
        is_guest: true,
      };
      assignPlayer(consumed.team, consumed.slot, guestPlayer);
      setPendingShareInvite({
        name: consumed.name,
        invite_url: consumed.invite_url,
        team: consumed.team,
      });
      setSearch("");
    }, [consumeAddNewPlayerResult, assignPlayer]),
  );

  return {
    team1,
    team2,
    score1,
    score2,
    roster,
    search,
    filteredRoster,
    isSearching,
    submitState,
    errorMessage,
    canSubmit,
    isRanked,
    lastSessionId,
    savedMatchId,
    filledCount,
    isBuilding,
    activeNextSlot,
    scoreWarning,
    scoreWarningKind,
    currentPlayerId,
    isEditMode,
    deleteState,
    sessionId,
    canShare,
    onShareSession,
    setScore1,
    setScore2,
    assignPlayer,
    removePlayer,
    swapSlots,
    setSearch,
    onSubmit: onSubmitVoid,
    onRetry,
    onDismissError,
    onAddAnother,
    onDelete,
    pendingShareInvite,
    openAddNewPlayer,
    clearPendingShareInvite,
  };
}
