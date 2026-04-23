/**
 * SessionPlayerChip — avatar circle in the horizontal roster strip.
 *
 * Highlighted (gold border) for the current user, dashed orange for placeholder.
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { SessionPlayer } from '@/lib/mockApi';

interface Props {
  readonly player: SessionPlayer;
  readonly isCurrentUser?: boolean;
}

const AVATAR_COLORS = ['#7fb3c7', '#d4a843', '#e87461', '#7bc47f', '#b07fc7'];

export default function SessionPlayerChip({
  player,
  isCurrentUser = false,
}: Props): React.ReactNode {
  const colorIndex = (player.id % AVATAR_COLORS.length);
  const bgColor = player.is_placeholder ? 'transparent' : AVATAR_COLORS[colorIndex];

  const borderStyle = isCurrentUser
    ? 'border-2 border-[#d4a843]'
    : player.is_placeholder
    ? 'border-2 border-dashed border-[#d4a843]'
    : 'border-2 border-transparent';

  return (
    <View
      testID={`player-chip-${player.id}`}
      className={`w-[44px] h-[44px] rounded-full items-center justify-center ${borderStyle}`}
      style={{ backgroundColor: bgColor }}
    >
      <Text className="text-white text-[12px] font-bold" style={{ color: player.is_placeholder ? '#d4a843' : '#fff' }}>
        {player.initials}
      </Text>
    </View>
  );
}
