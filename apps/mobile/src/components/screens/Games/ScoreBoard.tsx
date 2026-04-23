/**
 * ScoreBoard — split scoreboard for score entry.
 *
 * Matches the `.scoreboard-area` / `.board-half` pattern in score-league.html:
 *   Team 1 (teal left) | Team 2 (gold right)
 *   Each half: team label, 2 player slots, big score display + +/- stepper.
 *
 * The board is split horizontally at mobile width. Each half occupies half
 * the screen width. The score is entered via +/- buttons (stepper).
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import type { PlayerSlot } from './useScoreGameScreen';

// ---------------------------------------------------------------------------
// Player slot chip
// ---------------------------------------------------------------------------

interface PlayerChipProps {
  readonly slot: PlayerSlot;
  readonly index: 0 | 1;
  readonly team: 1 | 2;
  readonly onPress?: () => void;
}

function PlayerChip({ slot, index, team, onPress }: PlayerChipProps): React.ReactNode {
  const isEmpty = slot.player_id == null;

  return (
    <Pressable
      testID={`team${team}-slot${index}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isEmpty ? `Add player ${index + 1}` : slot.display_name}
      className={`flex-row items-center gap-2 px-3 py-2 rounded-[10px] min-h-[44px] w-full ${
        isEmpty
          ? 'border border-dashed border-gray-300 dark:border-gray-600'
          : team === 1
          ? 'bg-teal-100/60 dark:bg-teal-900/30'
          : 'bg-amber-100/60 dark:bg-amber-900/30'
      }`}
    >
      {isEmpty ? (
        <Text className="text-[12px] text-gray-400 dark:text-content-tertiary flex-1 text-center">
          + Add Player
        </Text>
      ) : (
        <>
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${
              team === 1 ? 'bg-teal-200 dark:bg-teal-800' : 'bg-amber-200 dark:bg-amber-800'
            }`}
          >
            <Text className="text-[10px] font-bold text-text-default dark:text-content-primary">
              {slot.initials}
            </Text>
          </View>
          <Text className="text-[14px] font-bold text-text-default dark:text-content-primary flex-1">
            {slot.display_name}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Score stepper
// ---------------------------------------------------------------------------

interface ScoreStepperProps {
  readonly score: number;
  readonly team: 1 | 2;
  readonly onInc: () => void;
  readonly onDec: () => void;
}

function ScoreStepper({ score, team, onInc, onDec }: ScoreStepperProps): React.ReactNode {
  const tealStyle = team === 1;

  return (
    <View className="items-center gap-2">
      {/* Big score */}
      <Text
        testID={`score-display-team${team}`}
        className={`text-[72px] font-black leading-none letter-spacing-[-2px] ${
          tealStyle
            ? 'text-navy dark:text-teal-200'
            : 'text-amber-800 dark:text-amber-200'
        }`}
      >
        {score}
      </Text>

      {/* +/- buttons */}
      <View className="flex-row items-center gap-4">
        <Pressable
          testID={`dec-score-team${team}`}
          onPress={onDec}
          disabled={score === 0}
          accessibilityRole="button"
          accessibilityLabel="Decrease score"
          className={`w-11 h-11 rounded-full border-2 items-center justify-center ${
            score === 0 ? 'opacity-20' : ''
          } ${
            tealStyle
              ? 'border-navy dark:border-teal-400'
              : 'border-amber-700 dark:border-amber-400'
          }`}
        >
          <Text
            className={`text-[24px] font-bold leading-none ${
              tealStyle
                ? 'text-navy dark:text-teal-200'
                : 'text-amber-800 dark:text-amber-200'
            }`}
          >
            -
          </Text>
        </Pressable>

        <Pressable
          testID={`inc-score-team${team}`}
          onPress={onInc}
          accessibilityRole="button"
          accessibilityLabel="Increase score"
          className={`w-11 h-11 rounded-full border-2 items-center justify-center ${
            tealStyle
              ? 'border-navy dark:border-teal-400'
              : 'border-amber-700 dark:border-amber-400'
          }`}
        >
          <Text
            className={`text-[24px] font-bold leading-none ${
              tealStyle
                ? 'text-navy dark:text-teal-200'
                : 'text-amber-800 dark:text-amber-200'
            }`}
          >
            +
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Board half (one team's side)
// ---------------------------------------------------------------------------

interface BoardHalfProps {
  readonly team: 1 | 2;
  readonly slots: readonly [PlayerSlot, PlayerSlot];
  readonly score: number;
  readonly onInc: () => void;
  readonly onDec: () => void;
  readonly onSlotPress?: (slot: 0 | 1) => void;
}

function BoardHalf({
  team,
  slots,
  score,
  onInc,
  onDec,
  onSlotPress,
}: BoardHalfProps): React.ReactNode {
  const isTeal = team === 1;

  return (
    <View
      className={`flex-1 items-center gap-3 px-3 py-5 ${
        isTeal
          ? 'bg-teal-100 dark:bg-navy/80'
          : 'bg-amber-100 dark:bg-amber-900/40'
      }`}
    >
      {/* Team label */}
      <Text
        className={`text-[11px] font-bold uppercase tracking-widest ${
          isTeal
            ? 'text-navy/70 dark:text-teal-300/70'
            : 'text-amber-800/70 dark:text-amber-300/70'
        }`}
      >
        Team {team}
      </Text>

      {/* Player slots */}
      <View className="w-full gap-2">
        <PlayerChip
          slot={slots[0]}
          index={0}
          team={team}
          onPress={() => onSlotPress?.(0)}
        />
        <PlayerChip
          slot={slots[1]}
          index={1}
          team={team}
          onPress={() => onSlotPress?.(1)}
        />
      </View>

      {/* Score stepper */}
      <ScoreStepper score={score} team={team} onInc={onInc} onDec={onDec} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main ScoreBoard export
// ---------------------------------------------------------------------------

interface ScoreBoardProps {
  readonly team1Slots: readonly [PlayerSlot, PlayerSlot];
  readonly team2Slots: readonly [PlayerSlot, PlayerSlot];
  readonly score1: number;
  readonly score2: number;
  readonly onIncScore1: () => void;
  readonly onDecScore1: () => void;
  readonly onIncScore2: () => void;
  readonly onDecScore2: () => void;
  readonly onSlotPress?: (team: 1 | 2, slot: 0 | 1) => void;
}

export default function ScoreBoard({
  team1Slots,
  team2Slots,
  score1,
  score2,
  onIncScore1,
  onDecScore1,
  onIncScore2,
  onDecScore2,
  onSlotPress,
}: ScoreBoardProps): React.ReactNode {
  const handleSlot1Press = useCallback(
    (slot: 0 | 1) => onSlotPress?.(1, slot),
    [onSlotPress],
  );
  const handleSlot2Press = useCallback(
    (slot: 0 | 1) => onSlotPress?.(2, slot),
    [onSlotPress],
  );

  return (
    <View testID="scoreboard" className="flex-row">
      <BoardHalf
        team={1}
        slots={team1Slots}
        score={score1}
        onInc={onIncScore1}
        onDec={onDecScore1}
        onSlotPress={handleSlot1Press}
      />

      {/* Divider */}
      <View className="w-[2px] bg-gray-300 dark:bg-gray-600" />

      <BoardHalf
        team={2}
        slots={team2Slots}
        score={score2}
        onInc={onIncScore2}
        onDec={onDecScore2}
        onSlotPress={handleSlot2Press}
      />
    </View>
  );
}
