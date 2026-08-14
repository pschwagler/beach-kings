/**
 * ScoreGameScreen — main orchestrator for the score entry modal.
 *
 * States:
 *   idle / loading — shows scoreboard + roster picker (building) or score steppers (scoring)
 *   error          — shows error card with retry / discard
 *   success        — shows success card with winner + Done / Add Another
 *
 * Wireframe refs: score-league.html, score-scoreboard.html
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AppText from '@/components/ui/AppText';
import { View, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";

import { XIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui";
import { routes } from "@/lib/navigation";
import { formatGameScore, formatPlayerShort } from "@/lib/formatters";
import { useScoreGameScreen } from "./useScoreGameScreen";
import ScoreBoard from "./ScoreBoard";
import ScoreNumpad from "./ScoreNumpad";
import RosterPicker from "./RosterPicker";
import ScoreGameMenu from "./ScoreGameMenu";
import ScoreboardToast from "./ScoreboardToast";
import { hapticLight, hapticMedium } from "@/utils/haptics";
import { shareLink } from "@/utils/share";
import { usePaletteColors } from '@/theme/usePaletteColors';
import type { RosterPlayer, PlayerSlot } from "./useScoreGameScreen";

export interface ScoreGameScreenProps {
  readonly sessionId?: number | null;
  readonly leagueId?: number | null;
  readonly seasonId?: number | null;
  /** When set, the screen is in edit mode for this match. */
  readonly matchId?: number | null;
  readonly gameNumber?: number | null;
  readonly sessionLabel?: string | null;
  readonly headerTitle?: string | null;
}

/** Format the success-state description: "P S / Q M beat R T / S U", or tied form on a tie. */
function buildSuccessDesc(
  team1: readonly [PlayerSlot, PlayerSlot],
  team2: readonly [PlayerSlot, PlayerSlot],
  score1: number,
  score2: number,
): string {
  const t1 = `${formatPlayerShort(team1[0].display_name)} / ${formatPlayerShort(team1[1].display_name)}`;
  const t2 = `${formatPlayerShort(team2[0].display_name)} / ${formatPlayerShort(team2[1].display_name)}`;
  if (score1 === score2) return `${t1} tied ${t2}`;
  const winner = score1 > score2 ? t1 : t2;
  const loser = score1 > score2 ? t2 : t1;
  return `${winner} beat ${loser}`;
}

/** Build the modal-nav subtitle from route params, falling back to legacy text. */
function buildNavSubtitle(
  gameNumber: number | null | undefined,
  sessionLabel: string | null | undefined,
  leagueId: number | null | undefined,
): string | null {
  const label =
    sessionLabel != null && sessionLabel.length > 0 ? sessionLabel : null;
  if (gameNumber != null && label != null)
    return `Game #${gameNumber} · ${label}`;
  if (label != null) return label;
  // Fallback preserves prior behavior when callers haven't been updated yet.
  return leagueId != null ? "League Game" : "Pickup Game";
}

// ---------------------------------------------------------------------------
// Modal nav
// ---------------------------------------------------------------------------

interface ModalNavProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onClose: () => void;
  readonly onOpenMenu?: () => void;
  readonly disabled?: boolean;
}

function ModalNav({
  title,
  subtitle,
  onClose,
  onOpenMenu,
  disabled = false,
}: ModalNavProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-divider bg-page">
      <Pressable
        testID="modal-close-btn"
        onPress={onClose}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityState={{ disabled }}
        hitSlop={8}
        className={`w-9 h-9 items-center justify-center ${disabled ? "opacity-40" : ""}`}
      >
        <XIcon size={20} color={palette.textMuted} />
      </Pressable>

      <View className="absolute left-0 right-0 items-center pointer-events-none">
        <AppText className="text-[15px] font-bold text-default">{title}</AppText>
        {subtitle != null && (
          <AppText className="text-[11px] text-muted mt-[1px]">{subtitle}</AppText>
        )}
      </View>

      {onOpenMenu != null ? (
        <Pressable
          testID="score-menu-btn"
          onPress={onOpenMenu}
          accessibilityRole="button"
          accessibilityLabel="Score game menu"
          hitSlop={8}
          className="w-9 h-9 items-center justify-center"
        >
          <AppText className="text-[20px] text-default">···</AppText>
        </Pressable>
      ) : (
        // Placeholder to balance the X button
        <View className="w-9 h-9" />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

interface SuccessViewProps {
  readonly score1: number;
  readonly score2: number;
  readonly desc: string;
  readonly onDone: () => void;
  readonly onAddAnother: () => void;
  readonly onEdit?: () => void;
}

function SuccessView({
  score1,
  score2,
  desc,
  onDone,
  onAddAnother,
  onEdit,
}: SuccessViewProps): React.ReactNode {
  return (
    <View
      testID="score-success-view"
      className="flex-1 items-center justify-center px-6 py-16 gap-5"
    >
      <View className="w-20 h-20 rounded-full bg-success-tint border-[3px] border-success items-center justify-center">
        <AppText className="text-[36px]">{"✓"}</AppText>
      </View>

      <AppText className="text-[22px] font-bold text-default text-center">
        Game Saved!
      </AppText>

      <AppText
        testID="score-success-desc"
        className="text-[14px] text-muted text-center leading-[1.55] max-w-[280px]"
      >
        {desc}
      </AppText>

      <View className="items-center mt-2">
        <AppText
          testID="score-success-final"
          className="text-[28px] font-bold text-default"
        >
          {formatGameScore(score1, score2)}
        </AppText>
        <AppText className="text-[11px] text-muted uppercase tracking-wide mt-[2px]">
          Final Score
        </AppText>
      </View>

      <View className="w-full gap-2 mt-3">
        <Pressable
          testID="done-btn"
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
          className="w-full py-4 rounded-[12px] bg-brand-gold items-center"
        >
          <AppText className="text-on-brand-gold font-bold text-[16px]">Done</AppText>
        </Pressable>

        <Pressable
          testID="add-another-btn"
          onPress={onAddAnother}
          accessibilityRole="button"
          accessibilityLabel="Add Another Game"
          className="w-full py-[14px] rounded-[12px] border border-brand-gold items-center"
        >
          <AppText className="text-[15px] font-bold text-accent">
            Add Another Game
          </AppText>
        </Pressable>

        {onEdit != null && (
          <Pressable
            testID="edit-game-btn"
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Edit Game"
            className="w-full py-3 items-center mt-1"
          >
            <AppText className="text-[13px] font-medium text-muted underline">
              Edit Game
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error screen
// ---------------------------------------------------------------------------

interface ErrorViewProps {
  readonly message: string | null;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}

function ErrorView({
  message,
  onRetry,
  onDiscard,
}: ErrorViewProps): React.ReactNode {
  return (
    <View
      testID="score-error-view"
      className="flex-1 items-center justify-center px-6 py-16 gap-5"
    >
      <View className="w-[72px] h-[72px] rounded-full bg-danger-tint border-[3px] border-danger items-center justify-center">
        <AppText className="text-[30px] text-red-500">!</AppText>
      </View>

      <AppText className="text-[20px] font-bold text-default text-center">
        Couldn't Save Game
      </AppText>

      <AppText className="text-[14px] text-muted text-center leading-[1.55] max-w-[300px]">
        {message ?? "Something went wrong. Please try again."}
      </AppText>

      <View className="w-full gap-2 mt-3">
        <Pressable
          testID="score-retry-btn"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try Again"
          className="w-full py-4 rounded-[12px] bg-brand-gold items-center"
        >
          <AppText className="text-on-brand-gold font-bold text-[16px]">Try Again</AppText>
        </Pressable>

        <Pressable
          testID="score-discard-btn"
          onPress={onDiscard}
          accessibilityRole="button"
          accessibilityLabel="Discard"
          className="w-full py-[14px] rounded-[12px] border border-divider items-center"
        >
          <AppText className="text-[14px] font-bold text-muted">Discard</AppText>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ScoreGameScreen({
  sessionId: routeSessionId,
  leagueId,
  seasonId,
  matchId,
  gameNumber,
  sessionLabel,
  headerTitle,
}: ScoreGameScreenProps = {}): React.ReactNode {
  const palette = usePaletteColors();
  const router = useRouter();
  const {
    team1,
    team2,
    score1,
    score2,
    filteredRoster,
    isSearching,
    search,
    submitState,
    errorMessage,
    canSubmit,
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
    onSubmit,
    onRetry,
    onAddAnother: hookOnAddAnother,
    onDelete,
    pendingShareInvite,
    openAddNewPlayer,
    clearPendingShareInvite,
  } = useScoreGameScreen({
    sessionId: routeSessionId,
    leagueId,
    seasonId,
    matchId,
  });

  const navigation = useNavigation();
  const [activeSlot, setActiveSlot] = useState<{
    readonly team: 1 | 2;
    readonly slot: 0 | 1;
  } | null>(null);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  // When the roster search is focused, the scoreboard collapses to a single
  // strip so the on-screen keyboard doesn't hide the search results.
  const [searchFocused, setSearchFocused] = useState(false);

  // Captured navigation action from a back-gesture / hardware-back that the
  // beforeRemove listener intercepted. Replayed on confirm to honor the user's
  // original navigation intent (e.g. swipe back to whichever screen pushed us).
  const pendingActionRef = useRef<unknown>(null);
  // Bypass flag so dispatching the captured action below doesn't re-enter the
  // listener and re-open the dialog.
  const skipGuardRef = useRef(false);

  // Auto-advance: use explicitly selected slot or the next empty one
  const effectiveActiveSlot = activeSlot ?? activeNextSlot;

  // Ref keeps handlePlayerSelect stable while always reading the latest slot
  const effectiveActiveSlotRef = useRef(effectiveActiveSlot);
  useEffect(() => {
    effectiveActiveSlotRef.current = effectiveActiveSlot;
  }, [effectiveActiveSlot]);

  // Navigation policy on close (matches MOBILE_ADD_GAMES_VALIDATION.md):
  // - sessionId known (existing or post-save) → replace into SessionDetail.
  // - otherwise → back to the Add Games tab.
  const navigateOnClose = useCallback(() => {
    const targetSessionId = lastSessionId ?? sessionId ?? null;
    if (targetSessionId != null) {
      router.replace(routes.session(targetSessionId) as never);
    } else {
      router.back();
    }
  }, [router, lastSessionId, sessionId]);

  // Only guard while the user is mid-build/score. In success state the data is
  // saved; in error state the user has already chosen between Retry/Discard, so
  // a second "discard?" prompt would be redundant.
  const hasProgress = useMemo(
    () =>
      submitState === "idle" && (filledCount > 0 || score1 > 0 || score2 > 0),
    [submitState, filledCount, score1, score2],
  );

  const isSaving = submitState === "loading";

  // Guard hardware-back, swipe-back gesture, and any other navigation removal:
  // - mid-save → block silently (no dialog over a pending request).
  // - has unsaved progress → capture the action, show confirm dialog.
  useEffect(() => {
    // expo-router exposes the underlying React Navigation prop. addListener's
    // type union doesn't include 'beforeRemove' in every stack flavor, so we
    // cast through unknown for that one call.
    const unsubscribe = (
      navigation as unknown as {
        addListener: (
          event: "beforeRemove",
          cb: (e: {
            preventDefault: () => void;
            data: { action: unknown };
          }) => void,
        ) => () => void;
      }
    ).addListener("beforeRemove", (e) => {
      if (skipGuardRef.current) {
        skipGuardRef.current = false;
        return;
      }
      if (isSaving) {
        e.preventDefault();
        return;
      }
      if (!hasProgress || isEditMode) return;
      e.preventDefault();
      pendingActionRef.current = e.data.action;
      setDiscardConfirmVisible(true);
    });
    return unsubscribe;
  }, [navigation, hasProgress, isSaving, isEditMode]);

  const handleClose = useCallback(() => {
    if (isSaving) return;
    if (hasProgress && !isEditMode) {
      setDiscardConfirmVisible(true);
      return;
    }
    navigateOnClose();
  }, [isSaving, hasProgress, isEditMode, navigateOnClose]);

  const handleDiscardConfirm = useCallback(() => {
    setDiscardConfirmVisible(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    // Bypass the beforeRemove guard for the navigation we're about to fire —
    // hasProgress is still true (we haven't cleared slots), so without this the
    // listener would intercept and re-show the discard dialog.
    skipGuardRef.current = true;
    if (action != null) {
      // Came from beforeRemove (gesture / hardware-back) — replay the captured
      // navigation so we land where the user originally intended.
      (navigation as unknown as { dispatch: (a: unknown) => void }).dispatch(
        action,
      );
      return;
    }
    // Came from the in-screen X button — apply navigation policy.
    navigateOnClose();
  }, [navigation, navigateOnClose]);

  const handleDiscardCancel = useCallback(() => {
    setDiscardConfirmVisible(false);
    pendingActionRef.current = null;
  }, []);

  const handleDone = useCallback(() => {
    navigateOnClose();
  }, [navigateOnClose]);

  const handleSlotPress = useCallback((team: 1 | 2, slot: 0 | 1) => {
    setActiveSlot({ team, slot });
  }, []);

  const handleRemovePlayer = useCallback(
    (team: 1 | 2, slot: 0 | 1) => {
      removePlayer(team, slot);
      setActiveSlot(null);
    },
    [removePlayer],
  );

  const handlePlayerSelect = useCallback(
    (player: RosterPlayer) => {
      const target = effectiveActiveSlotRef.current;
      if (target != null) {
        assignPlayer(target.team, target.slot, player);
        setActiveSlot(null);
        // Reset the query so the picker returns to the default ranked roster,
        // ready for the next player without manually clearing the input.
        setSearch("");
      }
    },
    [assignPlayer, setSearch],
  );

  const handleEdit = useCallback(() => {
    if (savedMatchId == null) return;
    router.replace(
      routes.scoreGame({
        matchId: savedMatchId,
        sessionId: lastSessionId ?? undefined,
      }) as never,
    );
  }, [savedMatchId, lastSessionId, router]);

  const handleAddAnother = useCallback(() => {
    hookOnAddAnother();
    setActiveSlot(null);
  }, [hookOnAddAnother]);

  const handleSave = useCallback(() => {
    void hapticMedium();
    onSubmit();
  }, [onSubmit]);

  const [activeScoreTeam, setActiveScoreTeam] = useState<1 | 2 | null>(null);
  const [digitBuffer, setDigitBuffer] = useState("");

  // Default to team 1 the moment scoring mode begins — no useEffect needed.
  const effectiveActiveScoreTeam: 1 | 2 | null = isBuilding
    ? null
    : (activeScoreTeam ?? 1);

  const handleScoreTeamPress = useCallback((team: 1 | 2) => {
    setActiveScoreTeam(team);
    setDigitBuffer("");
  }, []);

  const handleDigit = useCallback(
    (digit: number) => {
      if (effectiveActiveScoreTeam === null) return;
      if (digitBuffer.length >= 2) return;
      const newBuffer = digitBuffer + String(digit);
      const score = parseInt(newBuffer, 10);
      if (effectiveActiveScoreTeam === 1) setScore1(score);
      else setScore2(score);
      if (newBuffer.length >= 2) {
        setDigitBuffer("");
        setActiveScoreTeam(effectiveActiveScoreTeam === 1 ? 2 : null);
      } else {
        setDigitBuffer(newBuffer);
      }
    },
    [effectiveActiveScoreTeam, digitBuffer, setScore1, setScore2],
  );

  const handleDelete = useCallback(() => {
    if (effectiveActiveScoreTeam === null) return;
    if (digitBuffer.length === 0) {
      if (effectiveActiveScoreTeam === 1) setScore1(0);
      else setScore2(0);
      return;
    }
    const newBuffer = digitBuffer.slice(0, -1);
    const score = newBuffer.length > 0 ? parseInt(newBuffer, 10) : 0;
    if (effectiveActiveScoreTeam === 1) setScore1(score);
    else setScore2(score);
    setDigitBuffer(newBuffer);
  }, [effectiveActiveScoreTeam, digitBuffer, setScore1, setScore2]);

  const handleNext = useCallback(() => {
    if (effectiveActiveScoreTeam === null) return;
    setDigitBuffer("");
    setActiveScoreTeam(effectiveActiveScoreTeam === 1 ? 2 : null);
  }, [effectiveActiveScoreTeam]);

  const handleErrorDiscard = useCallback(() => {
    navigateOnClose();
  }, [navigateOnClose]);

  const handleDeletePress = useCallback(() => {
    setDeleteConfirmVisible(true);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmVisible(false);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    setDeleteConfirmVisible(false);
    void onDelete().then((ok) => {
      if (!ok) return; // Stay on screen so the user can see the error.
      // After a successful delete, return to wherever this screen was opened
      // from. SessionDetail refetches on focus, so it picks up the removed game.
      // The pre-filled slots still count as "progress" to the close-guard, so
      // bypass it explicitly — the data we'd warn about is already gone.
      skipGuardRef.current = true;
      router.back();
    });
  }, [onDelete, router]);

  // --- Three-dot menu wiring ---
  const handleOpenMenu = useCallback(() => {
    void hapticLight();
    setMenuVisible(true);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuVisible(false);
  }, []);

  // Session creation is explicit. A new game opens the Start Session form;
  // an existing session opens its editor above this score draft.
  const handleManageSession = useCallback(() => {
    setMenuVisible(false);
    if (sessionId == null) {
      const playerIds = [...team1, ...team2].flatMap((slot) =>
        slot.player_id == null ? [] : [slot.player_id],
      );
      router.push(
        routes.createSession({ leagueId, seasonId, playerIds }) as never,
      );
      return;
    }
    router.push(routes.sessionEdit(sessionId) as never);
  }, [leagueId, router, seasonId, sessionId, team1, team2]);

  const handleShareSession = useCallback(() => {
    setMenuVisible(false);
    void onShareSession();
  }, [onShareSession]);

  const isDeleting = deleteState === "loading";

  const remaining = 4 - filledCount;
  const saveButtonLabel = isBuilding
    ? `Select ${remaining} more player${remaining === 1 ? "" : "s"}`
    : isSaving
      ? "Saving..."
      : "Save Game";

  const successDesc = buildSuccessDesc(team1, team2, score1, score2);

  const navTitle =
    headerTitle != null && headerTitle.length > 0
      ? headerTitle
      : isEditMode
        ? "Edit Game"
        : "Add Game";
  const navSubtitle = buildNavSubtitle(gameNumber, sessionLabel, leagueId);

  let content: React.ReactNode;
  if (submitState === "success") {
    content = (
      <SuccessView
        score1={score1}
        score2={score2}
        desc={successDesc}
        onDone={handleDone}
        onAddAnother={handleAddAnother}
        onEdit={savedMatchId != null ? handleEdit : undefined}
      />
    );
  } else if (submitState === "error") {
    content = (
      <ErrorView
        message={errorMessage}
        onRetry={onRetry}
        onDiscard={handleErrorDiscard}
      />
    );
  } else {
    content = (
      <>
        {/* Scoreboard — fixed at top. Collapses to a compact strip while the
            search is focused so the keyboard doesn't hide the results. */}
        <ScoreBoard
          team1Slots={team1}
          team2Slots={team2}
          score1={score1}
          score2={score2}
          isBuilding={isBuilding}
          activeSlot={effectiveActiveSlot}
          compact={searchFocused}
          activeScoreTeam={effectiveActiveScoreTeam}
          onScoreTeamPress={handleScoreTeamPress}
          onSlotPress={handleSlotPress}
          onRemovePlayer={handleRemovePlayer}
          onSwapSlots={swapSlots}
        />

        {/* Roster picker — only visible in building mode */}
        {isBuilding && (
          <RosterPicker
            roster={filteredRoster}
            team1={team1}
            team2={team2}
            search={search}
            onSearch={setSearch}
            onSelectPlayer={handlePlayerSelect}
            onAddNewPlayer={
              effectiveActiveSlot != null
                ? () => {
                    openAddNewPlayer(effectiveActiveSlot);
                  }
                : undefined
            }
            currentPlayerId={currentPlayerId}
            isSearching={isSearching}
            onSearchFocusChange={setSearchFocused}
          />
        )}

        {/* Numpad — only visible in scoring mode */}
        {!isBuilding && (
          <ScoreNumpad
            activeTeam={effectiveActiveScoreTeam}
            onDigit={handleDigit}
            onDelete={handleDelete}
            onNext={handleNext}
          />
        )}

        {/* Bottom bar */}
        <View className="bg-surface border-t border-divider px-4 pt-3 pb-8">
          <Pressable
            testID="save-game-btn"
            onPress={handleSave}
            disabled={!canSubmit || isSaving}
            accessibilityRole="button"
            accessibilityLabel={saveButtonLabel}
            accessibilityState={{
              disabled: !canSubmit || isSaving,
              busy: isSaving,
            }}
            className={`w-full py-4 rounded-[12px] items-center flex-row justify-center gap-2 border ${
              canSubmit ? 'bg-brand-gold border-brand-gold' : 'bg-warning-tint border-brand-gold opacity-disabled'
            }`}
          >
            {isSaving && <ActivityIndicator size="small" color={palette.onBrandGold} />}
            <AppText
              className={`font-bold text-[16px] ${canSubmit ? 'text-on-brand-gold' : 'text-warning'}`}
            >
              {saveButtonLabel}
            </AppText>
          </Pressable>

          {scoreWarning != null && (
            <AppText
              testID="score-warning"
              accessibilityRole={scoreWarningKind === "error" ? "alert" : undefined}
              accessibilityLiveRegion={
                scoreWarningKind === "error" ? "polite" : "none"
              }
              className={`text-[12px] text-center mt-2 ${
                scoreWarningKind === "error"
                  ? "text-danger font-semibold"
                  : "text-tertiary"
              }`}
            >
              {scoreWarning}
            </AppText>
          )}

          {isEditMode && (
            <Pressable
              testID="delete-game-link"
              onPress={handleDeletePress}
              disabled={isDeleting || isSaving}
              accessibilityRole="button"
              accessibilityLabel="Delete Game"
              hitSlop={8}
              className="mt-3 items-center"
            >
              <AppText className="text-[14px] font-semibold text-danger">
                {isDeleting ? "Deleting…" : "Delete Game"}
              </AppText>
            </Pressable>
          )}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={["top"]}
      testID="score-game-screen"
    >
      <ModalNav
        title={navTitle}
        subtitle={navSubtitle ?? undefined}
        onClose={handleClose}
        // Three-dot menu hidden in success/error screens — the entry-point
        // actions (Done / Retry) are the only meaningful follow-ups there.
        onOpenMenu={submitState === "idle" ? handleOpenMenu : undefined}
        disabled={isSaving}
      />
      {content}
      <ConfirmDialog
        testID="discard-confirm-dialog"
        visible={discardConfirmVisible}
        title="Discard this game?"
        message="You haven't saved this game yet. Your players and scores will be lost."
        confirmLabel="Discard"
        confirmVariant="destructive"
        cancelLabel="Keep Editing"
        onConfirm={handleDiscardConfirm}
        onCancel={handleDiscardCancel}
      />
      <ConfirmDialog
        testID="delete-confirm-dialog"
        visible={deleteConfirmVisible}
        title="Delete this game?"
        message="This game will be removed from the session. This can't be undone."
        confirmLabel="Delete"
        confirmVariant="destructive"
        cancelLabel="Keep Game"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
      <ScoreGameMenu
        visible={menuVisible}
        onClose={handleCloseMenu}
        onManageSession={handleManageSession}
        onShareSession={handleShareSession}
        canShare={canShare}
      />
      <ScoreboardToast
        visible={pendingShareInvite != null}
        message={
          pendingShareInvite != null
            ? `${pendingShareInvite.name} added to Team ${pendingShareInvite.team}`
            : ""
        }
        onDismiss={clearPendingShareInvite}
        onShare={
          pendingShareInvite != null
            ? () => {
                void shareLink(pendingShareInvite.invite_url, "Invite player to the app");
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}
