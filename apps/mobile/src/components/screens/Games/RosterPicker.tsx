/**
 * RosterPicker — embedded picker shown in building mode.
 *
 * Two sections:
 *   "In this session" — session/league players (source='session'), chip layout
 *   "Friends & recent opponents" — friends (source='friend'|'recent'), row layout
 *
 * Falls back to a single "Players" section when all players share the same source.
 *
 * testID="roster-picker" and testID="roster-chip-{id}" are preserved for existing tests.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import type { RosterPlayer } from './useScoreGameScreen';
import type { PlayerSlot } from './useScoreGameScreen';
import { SearchIcon, PlusIcon } from '@/components/ui/icons';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOnTeam(
  player: RosterPlayer,
  team: readonly [PlayerSlot, PlayerSlot],
): boolean {
  return (
    team[0].player_id === player.player_id ||
    team[1].player_id === player.player_id
  );
}

function teamBadge(
  player: RosterPlayer,
  team1: readonly [PlayerSlot, PlayerSlot],
  team2: readonly [PlayerSlot, PlayerSlot],
): 'T1' | 'T2' | null {
  if (isOnTeam(player, team1)) return 'T1';
  if (isOnTeam(player, team2)) return 'T2';
  return null;
}

// ---------------------------------------------------------------------------
// Session chip (compact pill)
// ---------------------------------------------------------------------------

interface SessionChipProps {
  readonly player: RosterPlayer;
  readonly badge: 'T1' | 'T2' | null;
  readonly isCurrentUser: boolean;
  readonly onPress: (player: RosterPlayer) => void;
}

function SessionChip({
  player,
  badge,
  isCurrentUser,
  onPress,
}: SessionChipProps): React.ReactNode {
  const handlePress = useCallback(() => onPress(player), [onPress, player]);
  const isSeated = badge != null;

  const chipBg = badge === 'T1'
    ? 'bg-info-tint border-brand-teal'
    : badge === 'T2'
    ? 'bg-warning-tint border-brand-gold'
    : 'bg-surface border-divider';

  const avatarBg = badge === 'T1'
    ? 'bg-brand-teal'
    : badge === 'T2'
    ? 'bg-brand-gold'
    : 'bg-elevated';

  // YOU pill renders only when the current user isn't seated yet — once seated,
  // the T1/T2 pill takes its place and already conveys identity via position.
  const showYouPill = isCurrentUser && badge == null;

  return (
    <Pressable
      testID={`roster-chip-${player.player_id}`}
      onPress={handlePress}
      disabled={isSeated}
      accessibilityRole="button"
      accessibilityLabel={
        isCurrentUser ? `${player.display_name} (you)` : player.display_name
      }
      className={`flex-row items-center gap-2 px-3 py-2 rounded-[24px] min-h-[44px] border ${chipBg} ${
        isSeated ? 'opacity-50' : ''
      }`}
    >
      <View className={`w-7 h-7 rounded-full items-center justify-center ${avatarBg}`}>
        <Text className="text-[9px] font-bold text-white">
          {player.initials}
        </Text>
      </View>
      <Text
        className={`text-[13px] font-semibold ${
          badge === 'T1' ? 'text-brand-teal' : badge === 'T2' ? 'text-warning' : 'text-default'
        }`}
      >
        {player.display_name}
      </Text>
      {badge != null && (
        <View
          className={`px-[5px] py-[1px] rounded-[4px] ${
            badge === 'T1' ? 'bg-info-tint' : 'bg-warning-tint'
          }`}
        >
          <Text
            className={`text-[9px] font-black ${
              badge === 'T1' ? 'text-brand-teal' : 'text-warning'
            }`}
          >
            {badge}
          </Text>
        </View>
      )}
      {showYouPill && (
        <View
          testID={`roster-chip-${player.player_id}-you-badge`}
          className="px-[5px] py-[1px] rounded-[4px] bg-brand-gold"
        >
          <Text className="text-[9px] font-black text-white">YOU</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Friend / recent opponent row
// ---------------------------------------------------------------------------

interface FriendRowProps {
  readonly player: RosterPlayer;
  readonly badge: 'T1' | 'T2' | null;
  readonly onPress: (player: RosterPlayer) => void;
}

function FriendRow({ player, badge, onPress }: FriendRowProps): React.ReactNode {
  const handlePress = useCallback(() => onPress(player), [onPress, player]);
  const isSeated = badge != null;

  return (
    <View
      className={`flex-row items-center gap-3 py-[10px] border-b border-divider min-h-[58px] ${
        isSeated ? 'opacity-50' : ''
      }`}
    >
      <View className="w-[38px] h-[38px] rounded-full bg-elevated items-center justify-center">
        <Text className="text-[11px] font-bold text-muted">
          {player.initials}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[14px] font-semibold text-default">
          {player.display_name}
        </Text>
        <View className="flex-row items-center gap-[5px] mt-[3px]">
          <View
            className={`px-[6px] py-[1px] rounded-[4px] ${
              player.source === 'friend' ? 'bg-info-tint' : 'bg-elevated'
            }`}
          >
            <Text
              className={`text-[10px] font-bold ${
                player.source === 'friend' ? 'text-brand-teal' : 'text-muted'
              }`}
            >
              {player.source === 'friend' ? 'Friend' : 'Recent opp'}
            </Text>
          </View>
        </View>
      </View>
      <Pressable
        testID={`roster-chip-${player.player_id}`}
        onPress={handlePress}
        disabled={isSeated}
        accessibilityRole="button"
        accessibilityLabel={`Add ${player.display_name}`}
        className="px-4 py-2 rounded-[20px] border border-brand-teal min-h-[36px] items-center justify-center"
      >
        <Text className="text-[13px] font-bold text-brand-teal">
          {badge != null ? badge : 'Add'}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({
  label,
  count,
}: {
  readonly label: string;
  readonly count?: string;
}): React.ReactNode {
  return (
    <View className="flex-row items-center gap-2 pt-3 pb-2">
      <Text className="text-[11px] font-bold text-muted uppercase tracking-wider">
        {label}
      </Text>
      {count != null && (
        <Text className="text-[11px] text-muted">{count}</Text>
      )}
      <View className="flex-1 h-[1px] bg-divider" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Add New Player CTA
// ---------------------------------------------------------------------------

interface AddNewCtaProps {
  readonly searchQuery: string;
  readonly onPress?: () => void;
}

function AddNewCta({ searchQuery, onPress }: AddNewCtaProps): React.ReactNode {
  const title = searchQuery.trim()
    ? `Add "${searchQuery.trim()}" as a New Player`
    : 'Add a New Player';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center gap-[10px] px-[14px] py-3 my-3 rounded-[12px] border border-dashed border-brand-gold"
      style={{ backgroundColor: '#fffbeb' }}
    >
      <View className="w-[30px] h-[30px] rounded-full bg-brand-gold items-center justify-center">
        <PlusIcon size={16} color="#fff" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[13px] font-bold" style={{ color: '#92400e' }}>
          {title}
        </Text>
        <Text className="text-[11px]" style={{ color: '#b45309' }}>
          Creates a profile they can claim later
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main RosterPicker
// ---------------------------------------------------------------------------

interface RosterPickerProps {
  readonly roster: readonly RosterPlayer[];
  readonly team1: readonly [PlayerSlot, PlayerSlot];
  readonly team2: readonly [PlayerSlot, PlayerSlot];
  readonly search: string;
  readonly onSearch: (q: string) => void;
  /** Called when a chip/row is tapped. Caller decides which slot to fill. */
  readonly onSelectPlayer: (player: RosterPlayer) => void;
  readonly onAddNewPlayer?: () => void;
  /** Logged-in player ID — drives the gold "YOU" pill on the matching chip. */
  readonly currentPlayerId?: number | null;
}

export default function RosterPicker({
  roster,
  team1,
  team2,
  search,
  onSearch,
  onSelectPlayer,
  onAddNewPlayer,
  currentPlayerId,
}: RosterPickerProps): React.ReactNode {
  const sessionPlayers = roster.filter((p) => p.source === 'session');
  const friendPlayers = roster.filter(
    (p) => p.source === 'friend' || p.source === 'recent',
  );
  const hasSessionSection = sessionPlayers.length > 0;
  const hasFriendSection = friendPlayers.length > 0;

  const seatedCount = sessionPlayers.filter(
    (p) => isOnTeam(p, team1) || isOnTeam(p, team2),
  ).length;

  return (
    <View testID="roster-picker" className="flex-1 bg-page border-t border-divider">
      {/* Search */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2 bg-surface border border-divider rounded-[12px] px-3 py-[10px] min-h-[44px]">
          <SearchIcon size={16} color="#bbb" />
          <TextInput
            testID="roster-search-input"
            value={search}
            onChangeText={onSearch}
            placeholder="Search players..."
            placeholderTextColor="#bbb"
            className="flex-1 text-[15px] text-default"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
      >
        {/* In this session */}
        {hasSessionSection && (
          <>
            <SectionLabel
              label="In this session"
              count={
                seatedCount > 0
                  ? `${seatedCount} of ${sessionPlayers.length} already on a team`
                  : undefined
              }
            />
            <View className="flex-row flex-wrap gap-2 pb-1">
              {sessionPlayers.map((player) => (
                <SessionChip
                  key={player.player_id}
                  player={player}
                  badge={teamBadge(player, team1, team2)}
                  isCurrentUser={
                    currentPlayerId != null &&
                    player.player_id === currentPlayerId
                  }
                  onPress={onSelectPlayer}
                />
              ))}
            </View>
          </>
        )}

        {/* Friends & recent opponents */}
        {hasFriendSection && (
          <>
            <SectionLabel label="Friends & recent opponents" />
            {friendPlayers.map((player) => (
              <FriendRow
                key={player.player_id}
                player={player}
                badge={teamBadge(player, team1, team2)}
                onPress={onSelectPlayer}
              />
            ))}
          </>
        )}

        {/* Single flat section when no source split */}
        {!hasSessionSection && !hasFriendSection && (
          <Text className="text-[13px] text-muted italic py-4 text-center">
            {search.trim() ? 'No players match your search.' : 'No players available.'}
          </Text>
        )}

        {/* Add new player CTA */}
        <AddNewCta searchQuery={search} onPress={onAddNewPlayer} />
      </ScrollView>
    </View>
  );
}
