/**
 * ScoreGameScreen — main orchestrator for the score entry modal.
 *
 * States:
 *   idle / loading — shows scoreboard + roster picker + Save Game bar
 *   error          — shows error card with retry / discard
 *   success        — shows success card with game stats + Done / Add Another
 *
 * Wireframe refs: score-league.html, score-scoreboard.html
 */

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { useScoreGameScreen } from './useScoreGameScreen';
import ScoreBoard from './ScoreBoard';
import RosterPicker from './RosterPicker';
import { hapticMedium } from '@/utils/haptics';
import type { RosterPlayer } from './useScoreGameScreen';

export interface ScoreGameScreenProps {
  /** Existing session to add the game to. Null/undefined → backend creates a new session. */
  readonly sessionId?: number | null;
  /** League context — enables ranked toggle and scopes roster. */
  readonly leagueId?: number | null;
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

interface SuccessViewProps {
  readonly score1: number;
  readonly score2: number;
  readonly onDone: () => void;
  readonly onAddAnother: () => void;
}

function SuccessView({
  score1,
  score2,
  onDone,
  onAddAnother,
}: SuccessViewProps): React.ReactNode {
  return (
    <View
      testID="score-success-view"
      className="flex-1 items-center justify-center px-6 py-16 gap-5"
    >
      {/* Icon */}
      <View className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 border-[3px] border-green-500 items-center justify-center">
        <Text className="text-[36px]">{'\u2713'}</Text>
      </View>

      <Text className="text-[22px] font-black text-text-default dark:text-content-primary text-center">
        Game Saved!
      </Text>

      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.55] max-w-[280px]">
        Your game has been recorded. Ratings will update after the session is
        processed.
      </Text>

      {/* Score summary */}
      <View className="flex-row gap-5 mt-2">
        <View className="items-center">
          <Text className="text-[20px] font-black text-navy dark:text-content-primary">
            {score1}
          </Text>
          <Text className="text-[11px] text-text-muted dark:text-content-tertiary uppercase tracking-wide mt-[2px]">
            Team 1
          </Text>
        </View>
        <View className="items-center justify-center">
          <Text className="text-[16px] font-bold text-text-muted dark:text-content-tertiary">
            -
          </Text>
        </View>
        <View className="items-center">
          <Text className="text-[20px] font-black text-navy dark:text-content-primary">
            {score2}
          </Text>
          <Text className="text-[11px] text-text-muted dark:text-content-tertiary uppercase tracking-wide mt-[2px]">
            Team 2
          </Text>
        </View>
      </View>

      {/* CTAs */}
      <View className="w-full gap-2 mt-3">
        <Pressable
          testID="add-another-btn"
          onPress={onAddAnother}
          accessibilityRole="button"
          accessibilityLabel="Add Another Game"
          className="w-full py-4 rounded-[12px] bg-brand-gold dark:bg-brand-gold items-center"
        >
          <Text className="text-white font-bold text-[16px]">
            Add Another Game
          </Text>
        </Pressable>

        <Pressable
          testID="done-btn"
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
          className="w-full py-[14px] rounded-[12px] border border-gray-200 dark:border-border-subtle items-center"
        >
          <Text className="text-[14px] font-bold text-text-muted dark:text-content-secondary">
            Done
          </Text>
        </Pressable>
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
      <View className="w-[72px] h-[72px] rounded-full bg-red-100 dark:bg-error-bg border-[3px] border-red-500 items-center justify-center">
        <Text className="text-[30px] text-red-500">!</Text>
      </View>

      <Text className="text-[20px] font-black text-text-default dark:text-content-primary text-center">
        Could Not Save
      </Text>

      <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center leading-[1.55] max-w-[300px]">
        {message ?? 'Something went wrong. Please try again.'}
      </Text>

      <View className="w-full gap-2 mt-3">
        <Pressable
          testID="score-retry-btn"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try Again"
          className="w-full py-4 rounded-[12px] bg-brand-gold dark:bg-brand-gold items-center"
        >
          <Text className="text-white font-bold text-[16px]">Try Again</Text>
        </Pressable>

        <Pressable
          testID="score-discard-btn"
          onPress={onDiscard}
          accessibilityRole="button"
          accessibilityLabel="Discard"
          className="w-full py-[14px] rounded-[12px] border border-gray-200 dark:border-border-subtle items-center"
        >
          <Text className="text-[14px] font-bold text-text-muted dark:text-content-secondary">
            Discard
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ScoreGameScreen({
  sessionId,
  leagueId,
}: ScoreGameScreenProps = {}): React.ReactNode {
  const router = useRouter();
  const {
    team1,
    team2,
    score1,
    score2,
    filteredRoster,
    search,
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
    onSubmit,
    onRetry,
    onDismissError,
    onAddAnother: hookOnAddAnother,
  } = useScoreGameScreen({ sessionId, leagueId });

  // Track which slot is "active" for the roster picker
  const [activeSlot, setActiveSlot] = useState<{
    team: 1 | 2;
    slot: 0 | 1;
  } | null>(null);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleDone = useCallback(() => {
    if (lastSessionId != null) {
      router.replace(`/session-active?sessionId=${lastSessionId}` as never);
    } else {
      router.back();
    }
  }, [router, lastSessionId]);

  const handleSlotPress = useCallback((team: 1 | 2, slot: 0 | 1) => {
    setActiveSlot({ team, slot });
  }, []);

  const handlePlayerSelect = useCallback(
    (player: RosterPlayer) => {
      if (activeSlot != null) {
        assignPlayer(activeSlot.team, activeSlot.slot, player);
        setActiveSlot(null);
      }
    },
    [activeSlot, assignPlayer],
  );

  const handleAddAnother = useCallback(() => {
    hookOnAddAnother();
    setActiveSlot(null);
  }, [hookOnAddAnother]);

  const handleSave = useCallback(() => {
    void hapticMedium();
    onSubmit();
  }, [onSubmit]);

  // --- Success ---
  if (submitState === 'success') {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="score-game-screen"
      >
        <TopNav title="Score Game" showBack onBack={handleClose} />
        <SuccessView
          score1={score1}
          score2={score2}
          onDone={handleDone}
          onAddAnother={handleAddAnother}
        />
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (submitState === 'error') {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="score-game-screen"
      >
        <TopNav title="Score Game" showBack onBack={handleClose} />
        <ErrorView
          message={errorMessage}
          onRetry={onRetry}
          onDiscard={onDismissError}
        />
      </SafeAreaView>
    );
  }

  // --- Idle / Loading ---
  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="score-game-screen"
    >
      <TopNav title="Score Game" showBack onBack={handleClose} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Scoreboard */}
        <ScoreBoard
          team1Slots={team1}
          team2Slots={team2}
          score1={score1}
          score2={score2}
          onIncScore1={() => setScore1(score1 + 1)}
          onDecScore1={() => setScore1(Math.max(0, score1 - 1))}
          onIncScore2={() => setScore2(score2 + 1)}
          onDecScore2={() => setScore2(Math.max(0, score2 - 1))}
          onSlotPress={handleSlotPress}
        />

        {/* Ranked toggle — only shown for league games */}
        {leagueId != null && (
          <View
            testID="ranked-toggle-row"
            className="flex-row items-center justify-between px-4 py-3 mx-4 mt-2 rounded-xl bg-gray-50 dark:bg-dark-surface"
          >
            <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
              Ranked Game
            </Text>
            <Switch
              testID="ranked-toggle"
              value={isRanked}
              onValueChange={setIsRanked}
              accessibilityLabel="Toggle ranked game"
            />
          </View>
        )}

        {/* Roster picker */}
        <RosterPicker
          roster={filteredRoster}
          team1={team1}
          team2={team2}
          search={search}
          onSearch={setSearch}
          onSelectPlayer={handlePlayerSelect}
        />
      </ScrollView>

      {/* Bottom bar */}
      <View className="bg-white dark:bg-dark-surface border-t border-gray-100 dark:border-border-subtle px-4 pt-3 pb-8">
        <Pressable
          testID="save-game-btn"
          onPress={handleSave}
          disabled={!canSubmit || submitState === 'loading'}
          accessibilityRole="button"
          accessibilityLabel="Save Game"
          className={`w-full py-4 rounded-[12px] items-center flex-row justify-center gap-2 ${
            canSubmit && submitState !== 'loading'
              ? 'bg-brand-gold dark:bg-brand-gold'
              : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          {submitState === 'loading' && (
            <ActivityIndicator size="small" color="#fff" />
          )}
          <Text
            className={`font-bold text-[16px] ${
              canSubmit && submitState !== 'loading'
                ? 'text-white'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {submitState === 'loading' ? 'Saving...' : 'Save Game'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
