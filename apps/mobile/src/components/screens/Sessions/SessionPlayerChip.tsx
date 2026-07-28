/**
 * SessionPlayerChip — avatar circle in the horizontal roster strip.
 *
 * Highlighted (gold border) for the current user, dashed gold for placeholder.
 * Optional onPress wires the chip to the player profile.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import type { SessionPlayer } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';

interface Props {
  readonly player: SessionPlayer;
  readonly isCurrentUser?: boolean;
  readonly onPress?: () => void;
}

export default function SessionPlayerChip({
  player,
  isCurrentUser = false,
  onPress,
}: Props): React.ReactNode {
  const borderStyle = isCurrentUser
    ? 'border-2 border-brand-gold'
    : player.is_placeholder
    ? 'border-2 border-dashed border-brand-gold'
    : 'border-2 border-transparent';

  const inner = (
    <Avatar
      imageUrl={player.avatar_url}
      name={player.display_name}
      size={44}
      variant={player.is_placeholder ? 'guest' : 'teal'}
      colorSeed={player.is_placeholder ? undefined : (player.player_id ?? player.entry_id)}
      className={borderStyle}
      accessible={onPress == null}
    />
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
