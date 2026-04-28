/**
 * SessionRosterRow — a single player row in the Manage Players screen.
 *
 * Shows avatar initials, name, game count, and optional Remove button.
 * Players with active games cannot be removed (no Remove button shown).
 * Wireframe ref: session-roster-manage.html
 */

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { SessionPlayerEntry } from '@beach-kings/shared';

const AVATAR_COLORS = ['#7fb3c7', '#d4a843', '#e87461', '#7bc47f', '#b07fc7'];

interface Props {
  readonly player: SessionPlayerEntry;
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
    : AVATAR_COLORS[player.player_id % AVATAR_COLORS.length];

  return (
    <View
      testID={`roster-row-${player.entry_id}`}
      className="flex-row items-center gap-[12px] py-[10px] border-b border-divider"
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
        <Text className="text-[14px] font-semibold text-default">
          {player.display_name}
        </Text>
        <Text className="text-[12px] text-muted mt-[1px]">
          {player.is_placeholder ? `Unregistered · ${player.game_count} game${player.game_count !== 1 ? 's' : ''}` : `${player.game_count} game${player.game_count !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* Game count badge */}
      {player.game_count > 0 && (
        <View className="bg-elevated px-[8px] py-[3px] rounded-[10px]">
          <Text className="text-[11px] font-semibold text-muted">
            {player.game_count}
          </Text>
        </View>
      )}

      {/* Remove button */}
      {canRemove && (
        isRemoving ? (
          <ActivityIndicator size="small" testID={`roster-removing-${player.entry_id}`} />
        ) : (
          <TouchableOpacity
            onPress={onRemove}
            testID={`roster-remove-${player.entry_id}`}
            className="border border-danger-tint bg-surface px-[12px] py-[6px] rounded-[8px]"
          >
            <Text className="text-[12px] font-semibold text-danger">Remove</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}
