/**
 * ScoreBoard — split scoreboard for score entry.
 *
 * Two modes driven by the `isBuilding` prop:
 *   building  — team slots visible, score steppers hidden, active slot named explicitly
 *   scoring   — all 4 seats filled, tappable score display visible with numpad below
 *
 * The board is split horizontally. Each half occupies half the screen width.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import AppText from '@/components/ui/AppText';
import { AccessibilityInfo, View, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import type { AvatarVariant } from '@/components/ui/Avatar';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { formatPlayerShort } from '@/lib/formatters';
import type { PlayerSlot } from './useScoreGameScreen';
import {
  useScoreBoardDrag,
  toChipKey,
} from './useScoreBoardDrag';
import type { SlotKey, ChipKey } from './useScoreBoardDrag';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** Upper bound for a single team's score in a game. Display is 2-digit; product cap. */
export const MAX_SCORE = 99;

// ---------------------------------------------------------------------------
// Drag handle (6-dot grip)
// ---------------------------------------------------------------------------

function GripHandle(): React.ReactNode {
  const { textMuted } = usePaletteColors();
  return (
    <View className="w-[12px] h-[18px] items-center justify-center opacity-25">
      <Svg width={10} height={14} viewBox="0 0 24 24">
        <Circle cx={9} cy={6} r={1.5} fill={textMuted} />
        <Circle cx={15} cy={6} r={1.5} fill={textMuted} />
        <Circle cx={9} cy={12} r={1.5} fill={textMuted} />
        <Circle cx={15} cy={12} r={1.5} fill={textMuted} />
        <Circle cx={9} cy={18} r={1.5} fill={textMuted} />
        <Circle cx={15} cy={18} r={1.5} fill={textMuted} />
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
  readonly containerRef?: React.RefObject<View | null>;
  readonly isDragging?: boolean;
  readonly isDragTarget?: boolean;
  readonly onDragStart?: (absX: number, absY: number) => void;
  readonly onDragMove?: (absX: number, absY: number) => void;
  readonly onDragEnd?: (absX: number, absY: number) => void;
  readonly onDragCancel?: () => void;
}

function FilledChip({
  slot,
  index,
  team,
  isActive,
  onPress,
  onRemove,
  containerRef,
  isDragging = false,
  isDragTarget = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: PlayerChipProps): React.ReactNode {
  const isTeal = team === 1;
  const palette = usePaletteColors();
  const reduceMotion = useReducedMotion();
  const avatarVariant: AvatarVariant = isTeal ? 'teal' : 'gold';
  const placement = useSharedValue(reduceMotion ? 1 : 0);
  const placementStyle = useAnimatedStyle(() => ({
    opacity: placement.value,
    transform: [{ scale: 0.96 + placement.value * 0.04 }],
  }));

  useEffect(() => {
    placement.value = reduceMotion ? 1 : withTiming(1, { duration: 180 });
  }, [placement, reduceMotion]);

  const stableDragStart = useCallback(
    (absX: number, absY: number) => onDragStart?.(absX, absY),
    [onDragStart],
  );
  const stableDragMove = useCallback(
    (absX: number, absY: number) => onDragMove?.(absX, absY),
    [onDragMove],
  );
  const stableDragEnd = useCallback(
    (absX: number, absY: number) => onDragEnd?.(absX, absY),
    [onDragEnd],
  );
  const stableDragCancel = useCallback(
    () => onDragCancel?.(),
    [onDragCancel],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(180)
        .onStart((e) => {
          runOnJS(stableDragStart)(e.absoluteX, e.absoluteY);
        })
        .onChange((e) => {
          runOnJS(stableDragMove)(e.absoluteX, e.absoluteY);
        })
        .onEnd((e) => {
          runOnJS(stableDragEnd)(e.absoluteX, e.absoluteY);
        })
        .onFinalize((e, success) => {
          if (!success) {
            runOnJS(stableDragCancel)();
          } else {
            runOnJS(stableDragEnd)(e.absoluteX, e.absoluteY);
          }
        }),
    [stableDragStart, stableDragMove, stableDragEnd, stableDragCancel],
  );

  return (
    <Animated.View
      ref={containerRef}
      className={`flex-row items-center rounded-[10px] min-h-[44px] w-full ${
        isTeal ? 'bg-info-tint' : 'bg-warning-tint'
      }`}
      style={[
        placementStyle,
        isDragTarget ? { borderWidth: 2, borderColor: palette.brandTeal } : undefined,
      ]}
    >
      <GestureDetector gesture={panGesture}>
        <Pressable
          testID={`team${team}-slot${index}`}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Team ${team} player ${index + 1}, ${slot.display_name}${slot.is_guest === true ? ', guest' : ''}`}
          accessibilityState={{ selected: isActive }}
          className="flex-1 flex-row items-center gap-1 px-2 py-2"
          style={isDragging ? { opacity: 0.35 } : undefined}
        >
          <GripHandle />
          <Avatar
            name={slot.display_name}
            imageUrl={slot.avatar_url}
            size="sm"
            variant={avatarVariant}
            accessible={false}
          />
          <View className="flex-1">
            <AppText
              className="text-[14px] font-bold text-default"
              numberOfLines={2}
            >
              {formatPlayerShort(slot.display_name)}
              {slot.is_guest === true && (
                <AppText className="text-[12px] font-normal text-muted"> (guest)</AppText>
              )}
            </AppText>
          </View>
        </Pressable>
      </GestureDetector>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${slot.display_name}`}
        className="min-w-touch min-h-touch rounded-full items-center justify-center mr-1"
        style={{ backgroundColor: `${palette.textMuted}22` }}
      >
        <AppText className="text-[13px] font-semibold" style={{ color: palette.textMuted, lineHeight: 16 }}>
          ×
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function PlayerChip(props: PlayerChipProps): React.ReactNode {
  const { slot, index, team, isActive, onPress } = props;
  const isEmpty = slot.player_id == null;

  if (isEmpty) {
    return (
      <Pressable
        testID={`team${team}-slot${index}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Add Team ${team} player ${index + 1}`}
        accessibilityState={{ selected: isActive }}
        className={`relative flex-row items-center justify-center px-3 py-2 rounded-[10px] min-h-[44px] w-full ${
          isActive
            ? 'border-2 border-brand-gold bg-warning-tint'
            : 'border border-dashed border-divider'
        }`}
      >
        <AppText
          className={`text-[12px] ${
            isActive ? 'font-bold text-warning' : 'text-muted'
          }`}
        >
          {isActive ? 'Tap a player below' : '+ Add Player'}
        </AppText>
      </Pressable>
    );
  }

  return <FilledChip {...props} />;
}

// ---------------------------------------------------------------------------
// Score display (scoring mode only — tappable score box)
// ---------------------------------------------------------------------------

interface ScoreDisplayProps {
  readonly score: number;
  readonly team: 1 | 2;
  readonly isActive: boolean;
  readonly onPress: () => void;
}

function ScoreDisplay({ score, team, isActive, onPress }: ScoreDisplayProps): React.ReactNode {
  const isTeal = team === 1;
  const palette = usePaletteColors();
  const ringColor = isTeal ? palette.brandTeal : palette.brandGold;

  return (
    <Pressable
      testID={`score-box-team${team}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Team ${team} score, ${score}`}
      accessibilityValue={{ now: score, text: String(score) }}
      accessibilityState={{ selected: isActive }}
      className="min-h-touch items-center py-2"
    >
      <View
        style={{
          borderWidth: 3,
          borderColor: isActive ? ringColor : 'transparent',
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 4,
        }}
      >
        <AppText
          testID={`score-display-team${team}`}
          family="display"
          className={`text-[72px] font-bold leading-none text-center ${
            isTeal ? 'text-brand-teal' : 'text-warning'
          }`}
          style={{ opacity: 0.85, minWidth: 90 }}
        >
          {String(score).padStart(2, '0')}
        </AppText>
      </View>
    </Pressable>
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
  readonly activeScoreTeam?: 1 | 2 | null;
  readonly onSlotPress?: (slot: 0 | 1) => void;
  readonly onRemovePlayer?: (slot: 0 | 1) => void;
  readonly onScoreTeamPress?: () => void;
  readonly setChipRef?: (key: ChipKey, ref: View | null) => void;
  readonly dragFrom?: SlotKey | null;
  readonly dragTarget?: SlotKey | null;
  readonly onChipDragStart?: (slot: 0 | 1, absX: number, absY: number) => void;
  readonly onChipDragMove?: (absX: number, absY: number) => void;
  readonly onChipDragEnd?: (absX: number, absY: number) => void;
  readonly onChipDragCancel?: () => void;
}

function BoardHalf({
  team,
  slots,
  score,
  isBuilding,
  activeSlot,
  activeScoreTeam,
  onSlotPress,
  onRemovePlayer,
  onScoreTeamPress,
  setChipRef,
  dragFrom,
  dragTarget,
  onChipDragStart,
  onChipDragMove,
  onChipDragEnd,
  onChipDragCancel,
}: BoardHalfProps): React.ReactNode {
  const isTeal = team === 1;

  const chipRef0 = useRef<View>(null);
  const chipRef1 = useRef<View>(null);

  useEffect(() => {
    if (setChipRef == null) return;
    setChipRef(toChipKey(team, 0), chipRef0.current);
    setChipRef(toChipKey(team, 1), chipRef1.current);
  });

  return (
    <View
      className={`flex-1 items-center gap-3 px-3 py-5 ${
        isTeal ? 'bg-info-tint' : 'bg-warning-tint'
      }`}
    >
      <AppText
        className={`text-[11px] font-bold uppercase tracking-widest ${
          isTeal ? 'text-brand-teal' : 'text-warning'
        }`}
      >
        Team {team}
      </AppText>

      <View className="w-full gap-2">
        <PlayerChip
          slot={slots[0]}
          index={0}
          team={team}
          isActive={activeSlot?.team === team && activeSlot?.slot === 0}
          onPress={() => onSlotPress?.(0)}
          onRemove={() => onRemovePlayer?.(0)}
          containerRef={chipRef0}
          isDragging={dragFrom?.team === team && dragFrom?.slot === 0}
          isDragTarget={dragTarget?.team === team && dragTarget?.slot === 0}
          onDragStart={(x, y) => onChipDragStart?.(0, x, y)}
          onDragMove={onChipDragMove}
          onDragEnd={onChipDragEnd}
          onDragCancel={onChipDragCancel}
        />
        <PlayerChip
          slot={slots[1]}
          index={1}
          team={team}
          isActive={activeSlot?.team === team && activeSlot?.slot === 1}
          onPress={() => onSlotPress?.(1)}
          onRemove={() => onRemovePlayer?.(1)}
          containerRef={chipRef1}
          isDragging={dragFrom?.team === team && dragFrom?.slot === 1}
          isDragTarget={dragTarget?.team === team && dragTarget?.slot === 1}
          onDragStart={(x, y) => onChipDragStart?.(1, x, y)}
          onDragMove={onChipDragMove}
          onDragEnd={onChipDragEnd}
          onDragCancel={onChipDragCancel}
        />
      </View>

      {!isBuilding && (
        <ScoreDisplay
          score={score}
          team={team}
          isActive={activeScoreTeam === team}
          onPress={() => onScoreTeamPress?.()}
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
  readonly activeScoreTeam?: 1 | 2 | null;
  readonly onScoreTeamPress?: (team: 1 | 2) => void;
  readonly onSlotPress?: (team: 1 | 2, slot: 0 | 1) => void;
  readonly onRemovePlayer?: (team: 1 | 2, slot: 0 | 1) => void;
  readonly onSwapSlots?: (from: { team: 1 | 2; slot: 0 | 1 }, to: { team: 1 | 2; slot: 0 | 1 }) => void;
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
      <AppText
        className={`text-[10px] font-bold uppercase tracking-wider ${
          isTeal ? 'text-brand-teal' : 'text-warning'
        }`}
      >
        T{team}
      </AppText>
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
              accessibilityLabel={`Add Team ${team} player ${idx + 1}`}
              accessibilityState={{ selected: isActive }}
              className={`flex-1 px-2 py-[4px] rounded-[8px] items-center justify-center min-h-touch border ${
                isActive
                  ? 'border-brand-gold bg-warning-tint'
                  : 'border-dashed border-divider'
              }`}
            >
              <AppText
                className={`text-[11px] ${
                  isActive ? 'font-bold text-warning' : 'text-muted'
                }`}
              >
                {isActive ? 'Tap below' : '+ Add'}
              </AppText>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={idx}
            testID={`compact-slot-team${team}-${idx}`}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`Team ${team} player ${idx + 1}, ${slot.display_name}`}
            accessibilityState={{ selected: isActive }}
            className={`flex-1 px-2 py-[4px] rounded-[8px] items-center justify-center min-h-touch ${
              isTeal ? 'bg-brand-teal' : 'bg-brand-gold'
            }`}
          >
            <AppText
              className={`text-[11px] font-bold ${isTeal ? 'text-on-brand-teal' : 'text-on-brand-gold'}`}
              numberOfLines={2}
            >
              {formatPlayerShort(slot.display_name)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Ghost chip overlay (follows finger during drag)
// ---------------------------------------------------------------------------

interface GhostChipProps {
  readonly visible: boolean;
  readonly label: string;
  readonly team: 1 | 2 | null;
  readonly ghostX: ReturnType<typeof useSharedValue<number>>;
  readonly ghostY: ReturnType<typeof useSharedValue<number>>;
}

function GhostChip({ visible, label, team, ghostX, ghostY }: GhostChipProps): React.ReactNode {
  const palette = usePaletteColors();
  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ghostX.value - 50 },
      { translateY: ghostY.value - 16 },
    ],
  }));

  if (!visible) return null;

  const bgColor = team === 1 ? palette.brandTeal : palette.brandGold;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          zIndex: 100,
          backgroundColor: bgColor,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
        },
        animStyle,
      ]}
    >
      <AppText
        className={`text-[13px] font-bold ${team === 1 ? 'text-on-brand-teal' : 'text-on-brand-gold'}`}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </Animated.View>
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
  activeScoreTeam,
  onScoreTeamPress,
  onSlotPress,
  onRemovePlayer,
  onSwapSlots,
}: ScoreBoardProps): React.ReactNode {
  const previousActiveSlot = useRef<string | null>(null);
  const handleScoreTeam1Press = useCallback(
    () => onScoreTeamPress?.(1),
    [onScoreTeamPress],
  );
  const handleScoreTeam2Press = useCallback(
    () => onScoreTeamPress?.(2),
    [onScoreTeamPress],
  );

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

  const handleSwap = useCallback(
    (from: SlotKey, to: SlotKey) => onSwapSlots?.(from, to),
    [onSwapSlots],
  );

  const {
    boardRef,
    setChipRef,
    dragFrom,
    dragTarget,
    ghostX,
    ghostY,
    onChipDragStart,
    onChipDragMove,
    onChipDragEnd,
    onChipDragCancel,
  } = useScoreBoardDrag({ onSwap: handleSwap });

  const handleTeam1DragStart = useCallback(
    (slot: 0 | 1, x: number, y: number) => onChipDragStart(1, slot, x, y),
    [onChipDragStart],
  );
  const handleTeam2DragStart = useCallback(
    (slot: 0 | 1, x: number, y: number) => onChipDragStart(2, slot, x, y),
    [onChipDragStart],
  );

  const ghostSlot = dragFrom != null
    ? (dragFrom.team === 1 ? team1Slots[dragFrom.slot] : team2Slots[dragFrom.slot])
    : null;
  const ghostLabel = ghostSlot != null ? formatPlayerShort(ghostSlot.display_name) : '';
  const activeSlotLabel = activeSlot != null
    ? `Choose Team ${activeSlot.team} player ${activeSlot.slot + 1}`
    : null;

  useEffect(() => {
    if (!isBuilding || activeSlotLabel == null) return;
    if (previousActiveSlot.current != null && previousActiveSlot.current !== activeSlotLabel) {
      AccessibilityInfo.announceForAccessibility(activeSlotLabel);
    }
    previousActiveSlot.current = activeSlotLabel;
  }, [activeSlotLabel, isBuilding]);

  // Compact mode only applies while building — once all 4 seats are filled the
  // picker (and its search input) is gone, so there's no keyboard to dodge.
  if (compact && isBuilding) {
    return (
      <View testID="scoreboard" className="border-b border-divider">
        {activeSlotLabel != null && (
          <AppText testID="active-slot-label" className="bg-surface px-3 py-1.5 text-[12px] font-bold text-default">
            {activeSlotLabel}
          </AppText>
        )}
        <View className="flex-row">
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
      </View>
    );
  }

  return (
    <View testID="scoreboard">
      {isBuilding && activeSlotLabel != null && (
        <AppText testID="active-slot-label" className="bg-surface px-4 py-2 text-[13px] font-bold text-default">
          {activeSlotLabel}
        </AppText>
      )}
      <View ref={boardRef} className="flex-row">
        <BoardHalf
        team={1}
        slots={team1Slots}
        score={score1}
        isBuilding={isBuilding}
        activeSlot={activeSlot ?? null}
        activeScoreTeam={activeScoreTeam}
        onSlotPress={handleSlot1Press}
        onRemovePlayer={handleRemove1}
        onScoreTeamPress={handleScoreTeam1Press}
        setChipRef={setChipRef}
        dragFrom={dragFrom}
        dragTarget={dragTarget}
        onChipDragStart={handleTeam1DragStart}
        onChipDragMove={onChipDragMove}
        onChipDragEnd={onChipDragEnd}
        onChipDragCancel={onChipDragCancel}
      />

        <View className="w-[2px] bg-divider" />

        <BoardHalf
        team={2}
        slots={team2Slots}
        score={score2}
        isBuilding={isBuilding}
        activeSlot={activeSlot ?? null}
        activeScoreTeam={activeScoreTeam}
        onSlotPress={handleSlot2Press}
        onRemovePlayer={handleRemove2}
        onScoreTeamPress={handleScoreTeam2Press}
        setChipRef={setChipRef}
        dragFrom={dragFrom}
        dragTarget={dragTarget}
        onChipDragStart={handleTeam2DragStart}
        onChipDragMove={onChipDragMove}
        onChipDragEnd={onChipDragEnd}
        onChipDragCancel={onChipDragCancel}
      />

        <GhostChip
          visible={dragFrom != null}
          label={ghostLabel}
          team={dragFrom?.team ?? null}
          ghostX={ghostX}
          ghostY={ghostY}
        />
      </View>
    </View>
  );
}
