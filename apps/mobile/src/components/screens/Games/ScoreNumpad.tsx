/**
 * ScoreNumpad — custom in-app 3×4 numpad for score entry.
 *
 * Replaces the system keyboard for score input so there is no system UI
 * (cursor glow, selection handles) visible on screen. The numpad key colour
 * tracks the active team: teal for team 1, gold for team 2.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';

const TEAL = '#4daacc';
const GOLD = '#e0b44c';

const DIGIT_ROWS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

interface ScoreNumpadProps {
  readonly activeTeam: 1 | 2 | null;
  readonly onDigit: (digit: number) => void;
  readonly onDelete: () => void;
  readonly onNext: () => void;
}

export default function ScoreNumpad({
  activeTeam,
  onDigit,
  onDelete,
  onNext,
}: ScoreNumpadProps): React.ReactNode {
  const nextLabel = activeTeam === 2 ? 'DONE' : 'NEXT';
  const nextBg = activeTeam === 2 ? GOLD : activeTeam === 1 ? TEAL : '#aaa';

  return (
    <View testID="score-numpad" className="px-4 py-3 gap-[10px]">
      {DIGIT_ROWS.map((row) => (
        <View key={row[0]} className="flex-row gap-[10px]">
          {row.map((digit) => (
            <Pressable
              key={digit}
              testID={`numpad-${digit}`}
              onPress={() => onDigit(digit)}
              accessibilityRole="button"
              accessibilityLabel={String(digit)}
              className="flex-1 h-[58px] rounded-2xl bg-elevated items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.55 } : undefined)}
            >
              <Text className="text-[24px] font-bold text-default">{digit}</Text>
            </Pressable>
          ))}
        </View>
      ))}

      {/* Bottom row: delete, 0, next/done */}
      <View className="flex-row gap-[10px]">
        <Pressable
          testID="numpad-delete"
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete"
          className="flex-1 h-[58px] rounded-2xl bg-elevated items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.55 } : undefined)}
        >
          <Text className="text-[22px] text-default">⌫</Text>
        </Pressable>

        <Pressable
          testID="numpad-0"
          onPress={() => onDigit(0)}
          accessibilityRole="button"
          accessibilityLabel="0"
          className="flex-1 h-[58px] rounded-2xl bg-elevated items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.55 } : undefined)}
        >
          <Text className="text-[24px] font-bold text-default">0</Text>
        </Pressable>

        <Pressable
          testID="numpad-next"
          onPress={activeTeam !== null ? onNext : undefined}
          disabled={activeTeam === null}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          className="flex-1 h-[58px] rounded-2xl items-center justify-center"
          style={({ pressed }) => [
            { backgroundColor: nextBg },
            activeTeam === null && { opacity: 0.35 },
            pressed && { opacity: 0.65 },
          ]}
        >
          <Text className="text-[13px] font-black text-white tracking-widest">
            {nextLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
