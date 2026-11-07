/**
 * ScoreNumpad — custom in-app 3×4 numpad for score entry.
 *
 * Replaces the system keyboard for score input so there is no system UI
 * (cursor glow, selection handles) visible on screen. The bottom corners
 * adjust the selected team's score; tapping a scoreboard selects its team.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';

const DIGIT_ROWS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

interface ScoreNumpadProps {
  readonly activeTeam: 1 | 2 | null;
  readonly onDigit: (digit: number) => void;
  readonly score: number;
  readonly onAdjust: (delta: -1 | 1) => void;
  readonly disabled?: boolean;
}

export default function ScoreNumpad({
  activeTeam,
  onDigit,
  score,
  onAdjust,
  disabled = false,
}: ScoreNumpadProps): React.ReactNode {
  const inactive = disabled || activeTeam == null;
  const decreaseDisabled = inactive || score <= 0;
  const increaseDisabled = inactive || score >= 99;

  return (
    <View testID="score-numpad" className="px-4 py-3 gap-[10px]">
      {DIGIT_ROWS.map((row) => (
        <View key={row[0]} className="flex-row gap-[10px]">
          {row.map((digit) => (
            <Pressable
              key={digit}
              testID={`numpad-${digit}`}
              onPress={() => onDigit(digit)}
              disabled={inactive}
              accessibilityRole="button"
              accessibilityLabel={String(digit)}
              accessibilityState={{ disabled: inactive }}
              className="flex-1 h-[58px] rounded-2xl bg-elevated items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.55 } : undefined)}
            >
              <AppText className="text-[24px] font-bold text-default">{digit}</AppText>
            </Pressable>
          ))}
        </View>
      ))}

      {/* Adjust the selected team's score without replacing its digits. */}
      <View className="flex-row gap-[10px]">
        <Pressable
          testID="numpad-decrease"
          onPress={() => onAdjust(-1)}
          disabled={decreaseDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Decrease Team ${activeTeam ?? 1} score`}
          accessibilityState={{ disabled: decreaseDisabled }}
          className="flex-1 h-[58px] rounded-2xl bg-elevated items-center justify-center"
          style={({ pressed }) => ({ opacity: decreaseDisabled ? 0.35 : pressed ? 0.55 : 1 })}
        >
          <AppText className="text-[24px] font-bold text-default">−</AppText>
        </Pressable>

        <Pressable
          testID="numpad-0"
          onPress={() => onDigit(0)}
          disabled={inactive}
          accessibilityRole="button"
          accessibilityLabel="0"
          accessibilityState={{ disabled: inactive }}
          className="flex-1 h-[58px] rounded-2xl bg-elevated items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.55 } : undefined)}
        >
          <AppText className="text-[24px] font-bold text-default">0</AppText>
        </Pressable>

        <Pressable
          testID="numpad-increase"
          onPress={() => onAdjust(1)}
          disabled={increaseDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Increase Team ${activeTeam ?? 1} score`}
          accessibilityState={{ disabled: increaseDisabled }}
          className="flex-1 h-[58px] rounded-2xl bg-elevated items-center justify-center"
          style={({ pressed }) => ({ opacity: increaseDisabled ? 0.35 : pressed ? 0.55 : 1 })}
        >
          <AppText className="text-[24px] font-bold text-default">+</AppText>
        </Pressable>
      </View>
    </View>
  );
}
