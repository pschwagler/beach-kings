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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';

import { XIcon } from '@/components/ui/icons';
import { ConfirmDialog } from '@/components/ui';
import { routes } from '@/lib/navigation';
import { formatPlayerShort } from '@/lib/formatters';
import { useScoreGameScreen } from './useScoreGameScreen';
import ScoreBoard from './ScoreBoard';
import ScoreNumpad from './ScoreNumpad';
import RosterPicker from './RosterPicker';
import ScoreGameMenu from './ScoreGameMenu';
import ScoreboardToast from './ScoreboardToast';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { shareLink } from '@/utils/share';
import type { RosterPlayer, PlayerSlot } from './useScoreGameScreen';

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
  const label = sessionLabel != null && sessionLabel.length > 0 ? sessionLabel : null;
  if (gameNumber != null && label != null) return `Game #${gameNumber} · ${label}`;
  if (label != null) return label;
  // Fallback preserves prior behavior when callers haven't been updated yet.
  return leagueId != null ? 'League Game' : 'Pickup Game';
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
        className={`w-9 h-9 items-center justify-center ${disabled ? 'opacity-40' : ''}`}
      >
        <XIcon size={20} color="#888" />
      </Pressable>

      <View className="absolute left-0 right-0 items-center pointer-events-none">
        <Text className="text-[15px] font-bold text-default">{title}</Text>
        {subtitle != null && (
          <Text className="text-[11px] text-muted mt-[1px]">{subtitle}</Text>
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
          <Text className="text-[20px] text-default">···</Text>
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
        <Text className="text-[36px]">{'✓'}</Text>
      </View>

      <Text className="text-[22px] font-black text-default text-center">
        Game Saved!
      </Text>

      <Text
        testID="score-success-desc"
        className="text-[14px] text-muted text-center leading-[1.55] max-w-[280px]"
      >
        {desc}
      </Text>

      <View className="items-center mt-2">
        <Text testID="score-success-final" className="text-[28px] font-black text-default">
          {score1}–{score2}
        </Text>
        <Text className="text-[11px] text-muted uppercase tracking-wide mt-[2px]">
          Final Score
        </Text>
      </View>

      <View className="w-full gap-2 mt-3">
        <Pressable
          testID="done-btn"
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
          className="w-full py-4 rounded-[12px] bg-brand-gold items-center"
        >
          <Text className="text-white font-bold text-[16px]">Done</Text>
        </Pressable>

        <Pressable
          testID="add-another-btn"
          onPress={onAddAnother}
          accessibilityRole="button"
          accessibilityLabel="Add Another Game"
          className="w-full py-[14px] rounded-[12px] border border-brand-gold items-center"
        >
          <Text className="text-[15px] font-bold text-brand-gold">Add Another Game</Text>
        </Pressable>

        {onEdit != null && (
          <Pressable
            testID="edit-game-btn"
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Edit Game"
            className="w-full py-3 items-center mt-1"
          >
            <Text className="text-[13px] font-medium text-muted underline">Edit Game</Text>
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

function ErrorView({ message, onRetry, onDiscard }: ErrorViewProps): React.ReactNode {
  return (
    <View
      testID="score-error-view"
      className="flex-1 items-center justify-center px-6 py-16 gap-5"
    >
      <View className="w-[72px] h-[72px] rounded-full bg-danger-tint border-[3px] border-danger items-center justify-center">
        <Text className="text-[30px] text-red-500">!</Text>
      </View>

      <Text className="text-[20px] font-black text-default text-center">
        Couldn't Save Game
      </Text>

      <Text className="text-[14px] text-muted text-center leading-[1.55] max-w-[300px]">
        {message ?? 'Something went wrong. Please try again.'}
      </Text>

      <View className="w-full gap-2 mt-3">
        <Pressable
          testID="score-retry-btn"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try Again"
          className="w-full py-4 rounded-[12px] bg-brand-gold items-center"
        >
          <Text className="text-white font-bold text-[16px]">Try Again</Text>
        </Pressable>

        <Pressable
          testID="score-discard-btn"
          onPress={onDiscard}
          accessibilityRole="button"
          accessibilityLabel="Discard"
          className="w-full py-[14px] rounded-[12px] border border-divider items-center"
        >
          <Text className="text-[14px] font-bold text-muted">Discard</Text>
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
      submitState === 'idle' &&
      (filledCount > 0 || score1 > 0 || score2 > 0),
    [submitState, filledCount, score1, score2],
  );

  const isSaving = submitState === 'loading';

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
          event: 'beforeRemove',
          cb: (e: {
            preventDefault: () => void;
            data: { action: unknown };
          }) => void,
        ) => () => void;
      }
    ).addListener('beforeRemove', (e) => {
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
      (
        navigation as unknown as { dispatch: (a: unknown) => void }
      ).dispatch(action);
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
        setSearch('');
      }
    },
    [assignPlayer, setSearch],
  );

  const handleEdit = useCallback(() => {
    if (savedMatchId == null) return;
    router.replace(
      routes.scoreGame({ matchId: savedMatchId, sessionId: lastSessionId ?? undefined }) as never,
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
  const [digitBuffer, setDigitBuffer] = useState('');

  // Default to team 1 the moment scoring mode begins — no useEffect needed.
  const effectiveActiveScoreTeam: 1 | 2 | null = isBuilding
    ? null
    : (activeScoreTeam ?? 1);

  const handleScoreTeamPress = useCallback((team: 1 | 2) => {
    setActiveScoreTeam(team);
    setDigitBuffer('');
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
        setDigitBuffer('');
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
    setDigitBuffer('');
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

  // "Manage Session": ensure a session exists, then route to its detail screen
  // so the user can rename it / invite players. On failure the menu closes;
  // errorMessage from the hook will surface in the error view if the user
  // proceeds to submit.
  const handleManageSession = useCallback(() => {
    void onManageSession().then((id) => {
      setMenuVisible(false);
      if (id == null) return;
      router.push(routes.session(id) as never);
    });
  }, [onManageSession, router]);

  const handleShareSession = useCallback(() => {
    setMenuVisible(false);
    void onShareSession();
  }, [onShareSession]);

  const isDeleting = deleteState === 'loading';

  const remaining = 4 - filledCount;
  const saveButtonLabel = isBuilding
    ? `Select ${remaining} more player${remaining === 1 ? '' : 's'}`
    : isSaving
    ? 'Saving...'
    : 'Save Game';

  const successDesc = buildSuccessDesc(team1, team2, score1, score2);

  const navTitle =
    headerTitle != null && headerTitle.length > 0
      ? headerTitle
      : isEditMode
      ? 'Edit Game'
      : 'Add Game';
  const navSubtitle = buildNavSubtitle(gameNumber, sessionLabel, leagueId);

  let content: React.ReactNode;
  if (submitState === 'success') {
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
  } else if (submitState === 'error') {
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
                ? () => { openAddNewPlayer(effectiveActiveSlot); }
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
            className="w-full py-4 rounded-[12px] items-center flex-row justify-center gap-2"
            style={
              canSubmit && !isSaving
                ? { backgroundColor: '#d4a843' }
                : isSaving
                ? { backgroundColor: '#d4a843', opacity: 0.6 }
                : { backgroundColor: 'rgba(212,168,67,0.12)', borderWidth: 1, borderColor: 'rgba(212,168,67,0.35)' }
            }
          >
            {isSaving && <ActivityIndicator size="small" color="#fff" />}
            <Text
              className="font-bold text-[16px]"
              style={
                canSubmit && !isSaving
                  ? { color: '#fff' }
                  : isSaving
                  ? { color: '#fff' }
                  : { color: 'rgba(212,168,67,0.7)' }
              }
            >
              {saveButtonLabel}
            </Text>
          </Pressable>

          {scoreWarning != null && (
            <Text
              testID="score-warning"
              className="text-[12px] text-tertiary text-center mt-2"
            >
              {scoreWarning}
            </Text>
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
              <Text className="text-[14px] font-semibold text-danger">
                {isDeleting ? 'Deleting…' : 'Delete Game'}
              </Text>
            </Pressable>
          )}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="score-game-screen"
    >
      <ModalNav
        title={navTitle}
        subtitle={navSubtitle ?? undefined}
        onClose={handleClose}
        // Three-dot menu hidden in success/error screens — the entry-point
        // actions (Done / Retry) are the only meaningful follow-ups there.
        onOpenMenu={submitState === 'idle' ? handleOpenMenu : undefined}
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
        isCreatingSession={isCreatingSession}
      />
      <ScoreboardToast
        visible={pendingShareInvite != null}
        message={
          pendingShareInvite != null
            ? `${pendingShareInvite.name} added to Team ${pendingShareInvite.team}`
            : ''
        }
        onDismiss={clearPendingShareInvite}
        onShare={
          pendingShareInvite != null
            ? () => {
                void shareLink(pendingShareInvite.invite_url, 'Share invite');
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}
