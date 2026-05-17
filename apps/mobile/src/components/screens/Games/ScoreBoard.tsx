/**
 * ScoreBoard — split scoreboard for score entry.
 *
 * Two modes driven by the `isBuilding` prop:
 *   building  — team slots visible, score steppers hidden, active-slot NEXT badge shown
 *   scoring   — all 4 seats filled, tappable score display visible with numpad below
 *
 * The board is split horizontally. Each half occupies half the screen width.
 */

import React, { useCallback, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import type { AvatarVariant } from '@/components/ui/Avatar';
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

  // Filled slot — chip + remove button are siblings inside a wrapper View so iOS
  // accessibility traversal doesn't drop the nested remove Pressable.
  const avatarVariant: AvatarVariant = isTeal ? 'teal' : 'gold';
  return (
    <View
      className={`flex-row items-center rounded-[10px] min-h-[44px] w-full ${
        isTeal ? 'bg-info-tint' : 'bg-warning-tint'
      }`}
    >
      <Pressable
        testID={`team${team}-slot${index}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={slot.display_name}
        className="flex-1 flex-row items-center gap-2 px-3 py-2"
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
          <Text
            className="text-[14px] font-bold text-default"
            numberOfLines={1}
          >
            {formatPlayerShort(slot.display_name)}
            {slot.is_guest === true && (
              <Text className="text-[12px] font-normal text-muted"> (guest)</Text>
            )}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${slot.display_name}`}
        hitSlop={8}
        className="w-[22px] h-[22px] rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}
      >
        <Text className="text-[13px] font-semibold" style={{ color: 'rgba(0,0,0,0.4)', lineHeight: 16 }}>
          ×
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Score display (scoring mode only — tappable score box)
// ---------------------------------------------------------------------------

const TEAL = '#4daacc';
const GOLD = '#e0b44c';

interface ScoreDisplayProps {
  readonly score: number;
  readonly team: 1 | 2;
  readonly isActive: boolean;
  readonly onPress: () => void;
}

function ScoreDisplay({ score, team, isActive, onPress }: ScoreDisplayProps): React.ReactNode {
  const isTeal = team === 1;
  const ringColor = isTeal ? TEAL : GOLD;

  return (
    <Pressable
      testID={`score-box-team${team}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Score for team ${team}`}
      className="items-center py-2"
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
        <Text
          testID={`score-display-team${team}`}
          className={`text-[72px] font-black leading-none text-center ${
            isTeal ? 'text-brand-teal' : 'text-warning'
          }`}
          style={{ opacity: 0.85, minWidth: 90 }}
        >
          {String(score)}
        </Text>
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
  activeScoreTeam,
  onScoreTeamPress,
  onSlotPress,
  onRemovePlayer,
}: ScoreBoardProps): React.ReactNode {
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
        activeScoreTeam={activeScoreTeam}
        onSlotPress={handleSlot1Press}
        onRemovePlayer={handleRemove1}
        onScoreTeamPress={handleScoreTeam1Press}
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
      />
    </View>
  );
}
