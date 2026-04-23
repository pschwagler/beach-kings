/**
 * SessionRosterRow — a single player row in the Manage Players screen.
 *
 * Shows avatar initials, name, game count, and optional Remove button.
 * Players with active games cannot be removed (no Remove button shown).
 * Wireframe ref: session-roster-manage.html
 */

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { SessionPlayer } from '@/lib/mockApi';

const AVATAR_COLORS = ['#7fb3c7', '#d4a843', '#e87461', '#7bc47f', '#b07fc7'];

interface Props {
  readonly player: SessionPlayer;
  readonly canRemove: boolean;
  readonly isRemoving: boolean;
  readonly onRemove: () => void;
}

export default function SessionRosterRow({
  player,
  canRemove,
  isRemoving,
  onRemove,
}: Props): React.ReactNode {
  const bgColor = player.is_placeholder
    ? 'transparent'
    : AVATAR_COLORS[player.id % AVATAR_COLORS.length];

  return (
    <View
      testID={`roster-row-${player.id}`}
      className="flex-row items-center gap-[12px] py-[10px] border-b border-[#f0f0f0] dark:border-[#2a2a2a]"
    >
      {/* Avatar */}
      <View
        className={`w-[40px] h-[40px] rounded-full items-center justify-center ${
          player.is_placeholder ? 'border-2 border-dashed border-[#d4a843]' : ''
        }`}
        style={{ backgroundColor: bgColor }}
      >
        <Text
          className="text-[13px] font-bold"
          style={{ color: player.is_placeholder ? '#d4a843' : '#fff' }}
        >
          {player.initials}
        </Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
          {player.display_name}
        </Text>
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary mt-[1px]">
          {player.is_placeholder ? `Unregistered · ${player.game_count} game${player.game_count !== 1 ? 's' : ''}` : `${player.game_count} game${player.game_count !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* Game count badge */}
      {player.game_count > 0 && (
        <View className="bg-[#f0f0f0] dark:bg-[#2a2a2a] px-[8px] py-[3px] rounded-[10px]">
          <Text className="text-[11px] font-semibold text-text-secondary dark:text-content-secondary">
            {player.game_count}
          </Text>
        </View>
      )}

      {/* Remove button */}
      {canRemove && (
        isRemoving ? (
          <ActivityIndicator size="small" testID={`roster-removing-${player.id}`} />
        ) : (
          <TouchableOpacity
            onPress={onRemove}
            testID={`roster-remove-${player.id}`}
            className="border border-[#fca5a5] bg-white dark:bg-[#1a1a1a] px-[12px] py-[6px] rounded-[8px]"
          >
            <Text className="text-[12px] font-semibold text-[#dc2626]">Remove</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}
