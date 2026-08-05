/**
 * SessionRosterRow — a single player row in the Manage Players screen.
 *
 * Shows avatar initials, name, game count, and optional Remove button.
 * Players with active games cannot be removed (no Remove button shown).
 * Wireframe ref: session-roster-manage.html
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { SessionPlayerEntry } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';

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
  return (
    <View
      testID={`roster-row-${player.entry_id}`}
      className="flex-row items-center gap-[12px] py-[10px] border-b border-divider"
    >
      {/* Avatar */}
      <Avatar
        imageUrl={player.avatar_url}
        name={player.display_name}
        size="md"
        variant={player.is_placeholder ? 'guest' : 'teal'}
        colorSeed={player.is_placeholder ? undefined : player.player_id}
        fallbackClassName={
          player.is_placeholder ? 'border-2 border-dashed border-brand-gold' : ''
        }
        accessible={false}
      />

      {/* Info */}
      <View className="flex-1">
        <AppText className="text-[14px] font-semibold text-default">
          {player.display_name}
        </AppText>
        <AppText className="text-[12px] text-muted mt-[1px]">
          {player.is_placeholder ? `Guest · ${player.game_count} game${player.game_count !== 1 ? 's' : ''}` : `${player.game_count} game${player.game_count !== 1 ? 's' : ''}`}
        </AppText>
      </View>

      {/* Game count badge */}
      {player.game_count > 0 && (
        <View className="bg-elevated px-[8px] py-[3px] rounded-[10px]">
          <AppText className="text-[11px] font-semibold text-muted">
            {player.game_count}
          </AppText>
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
            accessibilityRole="button"
            accessibilityLabel={`Remove ${player.display_name} from session`}
            className="min-h-touch justify-center rounded-[8px] border border-danger-tint bg-surface px-[12px]"
          >
            <AppText className="text-[12px] font-semibold text-danger">Remove</AppText>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}
