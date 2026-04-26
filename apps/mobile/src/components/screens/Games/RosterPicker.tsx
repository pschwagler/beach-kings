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

  let bgClass = 'bg-surface border border-divider';
  if (onTeam1) {
    bgClass = 'bg-info-tint border border-brand-teal';
  } else if (onTeam2) {
    bgClass = 'bg-warning-tint border border-brand-gold';
  }

  const avatarBg = onTeam1
    ? 'bg-brand-teal'
    : onTeam2
    ? 'bg-brand-gold'
    : 'bg-elevated';

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
            ? 'text-brand-teal'
            : onTeam2
            ? 'text-warning'
            : 'text-muted'
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
      className="bg-page px-4 py-3"
    >
      <Text className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
        Add Players
      </Text>

      {/* Search */}
      <View className="flex-row items-center gap-2 bg-surface border border-divider rounded-[10px] px-3 py-[10px] mb-[10px]">
        <Text className="text-muted text-[14px]">
          {'\uD83D\uDD0D'}
        </Text>
        <TextInput
          testID="roster-search-input"
          value={search}
          onChangeText={onSearch}
          placeholder="Search players..."
          placeholderTextColor="#bbb"
          className="flex-1 text-[14px] text-default"
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
          <Text className="text-[13px] text-muted italic">
            No players match your search.
          </Text>
        )}
      </View>
    </View>
  );
}
