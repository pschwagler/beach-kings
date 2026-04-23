/**
 * RosterPicker — search + chip grid for selecting players.
 *
 * Matches `.roster-picker` / `.roster-chip` in score-league.html.
 * Shows a search input and a grid of player chips. Chips that are
 * already assigned to team1 or team2 are visually highlighted.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import type { RosterPlayer } from './useScoreGameScreen';
import type { PlayerSlot } from './useScoreGameScreen';

function isOnTeam(
  player: RosterPlayer,
  team: readonly [PlayerSlot, PlayerSlot],
): boolean {
  return (
    team[0].player_id === player.player_id ||
    team[1].player_id === player.player_id
  );
}

interface RosterChipProps {
  readonly player: RosterPlayer;
  readonly onTeam1: boolean;
  readonly onTeam2: boolean;
  readonly onPress: (player: RosterPlayer) => void;
}

function RosterChip({
  player,
  onTeam1,
  onTeam2,
  onPress,
}: RosterChipProps): React.ReactNode {
  const handlePress = useCallback(() => onPress(player), [onPress, player]);

  let bgClass = 'bg-white dark:bg-dark-surface border border-gray-200 dark:border-border-subtle';
  if (onTeam1) {
    bgClass = 'bg-teal-100 dark:bg-teal-900/30 border border-teal-400 dark:border-teal-600';
  } else if (onTeam2) {
    bgClass = 'bg-amber-100 dark:bg-amber-900/30 border border-amber-400 dark:border-amber-600';
  }

  const avatarBg = onTeam1
    ? 'bg-teal-400'
    : onTeam2
    ? 'bg-amber-400'
    : 'bg-gray-300 dark:bg-gray-600';

  return (
    <Pressable
      testID={`roster-chip-${player.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={player.display_name}
      className={`flex-row items-center gap-[6px] px-3 py-2 rounded-[20px] min-h-[44px] mr-2 mb-2 ${bgClass}`}
    >
      <View className={`w-6 h-6 rounded-full items-center justify-center ${avatarBg}`}>
        <Text className="text-[9px] font-bold text-white">
          {player.initials}
        </Text>
      </View>
      <Text
        className={`text-[12px] font-bold ${
          onTeam1
            ? 'text-navy dark:text-teal-200'
            : onTeam2
            ? 'text-amber-800 dark:text-amber-200'
            : 'text-text-muted dark:text-content-secondary'
        }`}
      >
        {player.display_name}
      </Text>
    </Pressable>
  );
}

interface RosterPickerProps {
  readonly roster: readonly RosterPlayer[];
  readonly team1: readonly [PlayerSlot, PlayerSlot];
  readonly team2: readonly [PlayerSlot, PlayerSlot];
  readonly search: string;
  readonly onSearch: (q: string) => void;
  /** Called when a chip is tapped. Caller decides which slot to fill. */
  readonly onSelectPlayer: (player: RosterPlayer) => void;
}

export default function RosterPicker({
  roster,
  team1,
  team2,
  search,
  onSearch,
  onSelectPlayer,
}: RosterPickerProps): React.ReactNode {
  return (
    <View
      testID="roster-picker"
      className="bg-gray-50 dark:bg-base px-4 py-3"
    >
      <Text className="text-[11px] font-bold text-text-muted dark:text-content-tertiary uppercase tracking-wider mb-2">
        Add Players
      </Text>

      {/* Search */}
      <View className="flex-row items-center gap-2 bg-white dark:bg-dark-surface border border-gray-200 dark:border-border-subtle rounded-[10px] px-3 py-[10px] mb-[10px]">
        <Text className="text-text-muted dark:text-content-tertiary text-[14px]">
          {'\uD83D\uDD0D'}
        </Text>
        <TextInput
          testID="roster-search-input"
          value={search}
          onChangeText={onSearch}
          placeholder="Search players..."
          placeholderTextColor="#bbb"
          className="flex-1 text-[14px] text-text-default dark:text-content-primary"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Chip grid */}
      <View className="flex-row flex-wrap">
        {roster.map((player) => (
          <RosterChip
            key={player.player_id}
            player={player}
            onTeam1={isOnTeam(player, team1)}
            onTeam2={isOnTeam(player, team2)}
            onPress={onSelectPlayer}
          />
        ))}
        {roster.length === 0 && (
          <Text className="text-[13px] text-text-muted dark:text-content-tertiary italic">
            No players match your search.
          </Text>
        )}
      </View>
    </View>
  );
}
