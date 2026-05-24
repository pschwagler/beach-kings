/**
 * SessionPlayerChip — avatar circle in the horizontal roster strip.
 *
 * Highlighted (gold border) for the current user, dashed gold for placeholder.
 * Optional onPress wires the chip to the player profile.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { SessionPlayer } from '@beach-kings/shared';

interface Props {
  readonly player: SessionPlayer;
  readonly isCurrentUser?: boolean;
  readonly onPress?: () => void;
}

const AVATAR_COLORS = ['#7fb3c7', '#d4a843', '#e87461', '#7bc47f', '#b07fc7'];
// Placeholder initials inherit the gold border color. Kept as a literal here
// (rather than via usePaletteColors) so the component stays test-friendly —
// the value matches the light-mode brand-gold token; dark-mode parity is
// acceptable given the chip's small surface area.
const PLACEHOLDER_TEXT_COLOR = '#d4a843';

export default function SessionPlayerChip({
  player,
  isCurrentUser = false,
  onPress,
}: Props): React.ReactNode {
  const colorIndex = (player.entry_id % AVATAR_COLORS.length);
  const bgColor = player.is_placeholder ? 'transparent' : AVATAR_COLORS[colorIndex];

  const borderStyle = isCurrentUser
    ? 'border-2 border-brand-gold'
    : player.is_placeholder
    ? 'border-2 border-dashed border-brand-gold'
    : 'border-2 border-transparent';

  const inner = (
    <View
      className={`w-[44px] h-[44px] rounded-full items-center justify-center ${borderStyle}`}
      style={{ backgroundColor: bgColor }}
    >
      <Text
        className="text-[12px] font-bold"
        style={{ color: player.is_placeholder ? PLACEHOLDER_TEXT_COLOR : '#fff' }}
      >
        {player.initials}
      </Text>
    </View>
  );

  if (onPress == null) {
    return <View testID={`player-chip-${player.entry_id}`}>{inner}</View>;
  }

  return (
    <Pressable
      testID={`player-chip-${player.entry_id}`}
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={player.display_name}
      style={({ pressed }) => (pressed ? { opacity: 0.65 } : undefined)}
    >
      {inner}
    </Pressable>
  );
}
