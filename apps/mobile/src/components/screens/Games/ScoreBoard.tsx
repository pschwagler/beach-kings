/**
 * ScoreBoard — split scoreboard for score entry.
 *
 * Two modes driven by the `isBuilding` prop:
 *   building  — team slots visible, score steppers hidden, active-slot NEXT badge shown
 *   scoring   — all 4 seats filled, score steppers visible with TextInput
 *
 * The board is split horizontally. Each half occupies half the screen width.
 */

import React, { useCallback, useEffect } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { formatPlayerShort } from '@/lib/formatters';
import type { PlayerSlot } from './useScoreGameScreen';

/** Upper bound for a single team's score in a game. Display is 2-digit; product cap. */
export const MAX_SCORE = 99;

// ---------------------------------------------------------------------------
// Drag handle (6-dot grip — visual affordance only, no drag impl yet)
// ---------------------------------------------------------------------------

function GripHandle(): React.ReactNode {
  return (
    <View className="w-[18px] h-[18px] items-center justify-center mr-[2px] opacity-25">
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Circle cx={9} cy={6} r={1.5} fill="#888" />
        <Circle cx={15} cy={6} r={1.5} fill="#888" />
        <Circle cx={9} cy={12} r={1.5} fill="#888" />
        <Circle cx={15} cy={12} r={1.5} fill="#888" />
        <Circle cx={9} cy={18} r={1.5} fill="#888" />
        <Circle cx={15} cy={18} r={1.5} fill="#888" />
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Player slot chip
// ---------------------------------------------------------------------------

interface PlayerChipProps {
  readonly slot: PlayerSlot;
  readonly index: 0 | 1;
  readonly team: 1 | 2;
  readonly isActive: boolean;
  readonly onPress?: () => void;
  readonly onRemove?: () => void;
}

function PlayerChip({
  slot,
  index,
  team,
  isActive,
  onPress,
  onRemove,
}: PlayerChipProps): React.ReactNode {
  const isEmpty = slot.player_id == null;
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (isActive && isEmpty) {
      pulseOpacity.value = withRepeat(
        withTiming(0.25, { duration: 800 }),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = withTiming(1, { duration: 150 });
    }
  }, [isActive, isEmpty, pulseOpacity]);

  const badgeAnimStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const isTeal = team === 1;

  if (isEmpty) {
    return (
      <Pressable
        testID={`team${team}-slot${index}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Add player ${index + 1}`}
        className={`relative flex-row items-center justify-center px-3 py-2 rounded-[10px] min-h-[44px] w-full ${
          isActive
            ? 'border-2 border-brand-gold'
            : 'border border-dashed border-divider'
        }`}
        style={isActive ? { backgroundColor: 'rgba(212,168,67,0.12)' } : undefined}
      >
        <Text
          className={`text-[12px] ${
            isActive ? 'font-bold text-warning' : 'text-muted'
          }`}
        >
          {isActive ? 'Tap a player below' : '+ Add Player'}
        </Text>

        {isActive && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: -8,
                right: 8,
                backgroundColor: '#d4a843',
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 2,
              },
              badgeAnimStyle,
            ]}
          >
            <Text className="text-white text-[9px] font-black tracking-wider">
              NEXT
            </Text>
          </Animated.View>
        )}
      </Pressable>
    );
  }

  // Filled slot
  const isGuest = slot.is_guest === true;
  return (
    <Pressable
      testID={`team${team}-slot${index}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={slot.display_name}
      className={`flex-row items-center gap-2 px-3 py-2 rounded-[10px] min-h-[44px] w-full ${
        isGuest
          ? 'border border-dashed border-brand-gold'
          : isTeal
          ? 'bg-info-tint'
          : 'bg-warning-tint'
      }`}
      style={isGuest ? { backgroundColor: 'rgba(245,158,11,0.08)' } : undefined}
    >
      <GripHandle />
      <View
        className={`w-8 h-8 rounded-full items-center justify-center ${
          isGuest
            ? 'border border-dashed border-brand-gold'
            : isTeal
            ? 'bg-brand-teal'
            : 'bg-brand-gold'
        }`}
        style={isGuest ? { backgroundColor: 'rgba(245,158,11,0.2)' } : undefined}
      >
        <Text
          className={`text-[10px] font-bold ${isGuest ? 'text-warning' : 'text-white'}`}
        >
          {slot.initials}
        </Text>
      </View>
      <View className="flex-1">
        <Text
          className={`text-[14px] font-bold ${isGuest ? 'text-warning' : 'text-default'}`}
          numberOfLines={1}
        >
          {formatPlayerShort(slot.display_name)}
        </Text>
        {isGuest && (
          <Text className="text-[11px] text-warning italic">new</Text>
        )}
      </View>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${slot.display_name}`}
        hitSlop={8}
        className="w-[22px] h-[22px] rounded-full items-center justify-center ml-auto"
        style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}
      >
        <Text className="text-[13px] font-semibold" style={{ color: 'rgba(0,0,0,0.4)', lineHeight: 16 }}>
          ×
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Score stepper (scoring mode only)
// ---------------------------------------------------------------------------

interface ScoreStepperProps {
  readonly score: number;
  readonly team: 1 | 2;
  readonly onInc: () => void;
  readonly onDec: () => void;
  readonly onScoreChange: (n: number) => void;
}

function ScoreStepper({
  score,
  team,
  onInc,
  onDec,
  onScoreChange,
}: ScoreStepperProps): React.ReactNode {
  const isTeal = team === 1;

  return (
    <View className="items-center gap-2">
      <TextInput
        testID={`score-display-team${team}`}
        value={String(score)}
        onChangeText={(text) => {
          const num = parseInt(text, 10);
          onScoreChange(isNaN(num) ? 0 : Math.max(0, Math.min(MAX_SCORE, num)));
        }}
        keyboardType="number-pad"
        accessibilityLabel={`Score for team ${team}`}
        className={`text-[72px] font-black leading-none w-[90px] text-center border-b-2 bg-transparent p-0 ${
          isTeal ? 'text-brand-teal border-brand-teal' : 'text-warning border-brand-gold'
        }`}
        style={{ opacity: 0.85 }}
        maxLength={2}
        selectTextOnFocus
      />

      <View className="flex-row items-center gap-4">
        <Pressable
          testID={`dec-score-team${team}`}
          onPress={onDec}
          disabled={score === 0}
          accessibilityRole="button"
          accessibilityLabel="Decrease score"
          className={`w-11 h-11 rounded-full border-2 items-center justify-center ${
            score === 0 ? 'opacity-20' : ''
          } ${isTeal ? 'border-brand-teal' : 'border-brand-gold'}`}
        >
          <Text
            className={`text-[24px] font-bold leading-none ${
              isTeal ? 'text-brand-teal' : 'text-warning'
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
            isTeal ? 'border-brand-teal' : 'border-brand-gold'
          }`}
        >
          <Text
            className={`text-[24px] font-bold leading-none ${
              isTeal ? 'text-brand-teal' : 'text-warning'
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
  readonly isBuilding: boolean;
  readonly activeSlot: { readonly team: 1 | 2; readonly slot: 0 | 1 } | null;
  readonly onInc: () => void;
  readonly onDec: () => void;
  readonly onScoreChange: (n: number) => void;
  readonly onSlotPress?: (slot: 0 | 1) => void;
  readonly onRemovePlayer?: (slot: 0 | 1) => void;
}

function BoardHalf({
  team,
  slots,
  score,
  isBuilding,
  activeSlot,
  onInc,
  onDec,
  onScoreChange,
  onSlotPress,
  onRemovePlayer,
}: BoardHalfProps): React.ReactNode {
  const isTeal = team === 1;

  return (
    <View
      className={`flex-1 items-center gap-3 px-3 py-5 ${
        isTeal ? 'bg-info-tint' : 'bg-warning-tint'
      }`}
    >
      <Text
        className={`text-[11px] font-bold uppercase tracking-widest ${
          isTeal ? 'text-brand-teal' : 'text-warning'
        }`}
      >
        Team {team}
      </Text>

      <View className="w-full gap-2">
        <PlayerChip
          slot={slots[0]}
          index={0}
          team={team}
          isActive={
            activeSlot?.team === team && activeSlot?.slot === 0
          }
          onPress={() => onSlotPress?.(0)}
          onRemove={() => onRemovePlayer?.(0)}
        />
        <PlayerChip
          slot={slots[1]}
          index={1}
          team={team}
          isActive={
            activeSlot?.team === team && activeSlot?.slot === 1
          }
          onPress={() => onSlotPress?.(1)}
          onRemove={() => onRemovePlayer?.(1)}
        />
      </View>

      {!isBuilding && (
        <ScoreStepper
          score={score}
          team={team}
          onInc={onInc}
          onDec={onDec}
          onScoreChange={onScoreChange}
        />
      )}
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
  readonly isBuilding: boolean;
  readonly activeSlot?: { readonly team: 1 | 2; readonly slot: 0 | 1 } | null;
  /**
   * Compact mode renders a single-row team strip instead of the full board.
   * Used when the roster search input is focused so the keyboard doesn't
   * eat the search results. Only takes effect in building mode.
   */
  readonly compact?: boolean;
  readonly onIncScore1: () => void;
  readonly onDecScore1: () => void;
  readonly onIncScore2: () => void;
  readonly onDecScore2: () => void;
  readonly onChangeScore1: (n: number) => void;
  readonly onChangeScore2: (n: number) => void;
  readonly onSlotPress?: (team: 1 | 2, slot: 0 | 1) => void;
  readonly onRemovePlayer?: (team: 1 | 2, slot: 0 | 1) => void;
}

// ---------------------------------------------------------------------------
// Compact mode (rendered while the roster search is focused)
// ---------------------------------------------------------------------------

interface CompactBoardHalfProps {
  readonly team: 1 | 2;
  readonly slots: readonly [PlayerSlot, PlayerSlot];
  readonly activeSlot: { readonly team: 1 | 2; readonly slot: 0 | 1 } | null;
  readonly onSlotPress?: (slot: 0 | 1) => void;
}

function CompactBoardHalf({
  team,
  slots,
  activeSlot,
  onSlotPress,
}: CompactBoardHalfProps): React.ReactNode {
  const isTeal = team === 1;
  return (
    <View
      className={`flex-1 flex-row items-center gap-2 px-3 py-2 ${
        isTeal ? 'bg-info-tint' : 'bg-warning-tint'
      }`}
    >
      <Text
        className={`text-[10px] font-bold uppercase tracking-wider ${
          isTeal ? 'text-brand-teal' : 'text-warning'
        }`}
      >
        T{team}
      </Text>
      {[0, 1].map((idx) => {
        const slot = slots[idx as 0 | 1];
        const isEmpty = slot.player_id == null;
        const isActive =
          activeSlot?.team === team && activeSlot?.slot === (idx as 0 | 1);
        const handlePress = (): void => onSlotPress?.(idx as 0 | 1);

        if (isEmpty) {
          return (
            <Pressable
              key={idx}
              testID={`compact-slot-team${team}-${idx}`}
              onPress={handlePress}
              accessibilityRole="button"
              accessibilityLabel={`Add player ${idx + 1}`}
              className={`flex-1 px-2 py-[4px] rounded-[8px] items-center justify-center min-h-[26px] border ${
                isActive
                  ? 'border-brand-gold'
                  : 'border-dashed border-divider'
              }`}
              style={
                isActive ? { backgroundColor: 'rgba(212,168,67,0.18)' } : undefined
              }
            >
              <Text
                className={`text-[11px] ${
                  isActive ? 'font-bold text-warning' : 'text-muted'
                }`}
              >
                {isActive ? 'Tap below' : '+ Add'}
              </Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={idx}
            testID={`compact-slot-team${team}-${idx}`}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={slot.display_name}
            className={`flex-1 px-2 py-[4px] rounded-[8px] items-center justify-center min-h-[26px] ${
              isTeal ? 'bg-brand-teal' : 'bg-brand-gold'
            }`}
          >
            <Text
              className="text-[11px] font-bold text-white"
              numberOfLines={1}
            >
              {formatPlayerShort(slot.display_name)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ScoreBoard({
  team1Slots,
  team2Slots,
  score1,
  score2,
  isBuilding,
  activeSlot,
  compact = false,
  onIncScore1,
  onDecScore1,
  onIncScore2,
  onDecScore2,
  onChangeScore1,
  onChangeScore2,
  onSlotPress,
  onRemovePlayer,
}: ScoreBoardProps): React.ReactNode {
  const handleSlot1Press = useCallback(
    (slot: 0 | 1) => onSlotPress?.(1, slot),
    [onSlotPress],
  );
  const handleSlot2Press = useCallback(
    (slot: 0 | 1) => onSlotPress?.(2, slot),
    [onSlotPress],
  );
  const handleRemove1 = useCallback(
    (slot: 0 | 1) => onRemovePlayer?.(1, slot),
    [onRemovePlayer],
  );
  const handleRemove2 = useCallback(
    (slot: 0 | 1) => onRemovePlayer?.(2, slot),
    [onRemovePlayer],
  );

  // Compact mode only applies while building — once all 4 seats are filled the
  // picker (and its search input) is gone, so there's no keyboard to dodge.
  if (compact && isBuilding) {
    return (
      <View testID="scoreboard" className="flex-row border-b border-divider">
        <CompactBoardHalf
          team={1}
          slots={team1Slots}
          activeSlot={activeSlot ?? null}
          onSlotPress={handleSlot1Press}
        />
        <View className="w-[1px] bg-divider" />
        <CompactBoardHalf
          team={2}
          slots={team2Slots}
          activeSlot={activeSlot ?? null}
          onSlotPress={handleSlot2Press}
        />
      </View>
    );
  }

  return (
    <View testID="scoreboard" className="flex-row">
      <BoardHalf
        team={1}
        slots={team1Slots}
        score={score1}
        isBuilding={isBuilding}
        activeSlot={activeSlot ?? null}
        onInc={onIncScore1}
        onDec={onDecScore1}
        onScoreChange={onChangeScore1}
        onSlotPress={handleSlot1Press}
        onRemovePlayer={handleRemove1}
      />

      <View className="w-[2px] bg-divider" />

      <BoardHalf
        team={2}
        slots={team2Slots}
        score={score2}
        isBuilding={isBuilding}
        activeSlot={activeSlot ?? null}
        onInc={onIncScore2}
        onDec={onDecScore2}
        onScoreChange={onChangeScore2}
        onSlotPress={handleSlot2Press}
        onRemovePlayer={handleRemove2}
      />
    </View>
  );
}
