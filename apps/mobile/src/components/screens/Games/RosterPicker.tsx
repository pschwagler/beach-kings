/**
 * RosterPicker — embedded picker shown in building mode.
 *
 * Renders a single relevance-ranked list (order comes straight from the
 * backend's additive scoring at `/api/players/search`). Session players lead
 * as compact chips; everyone else is a row annotated with its strongest
 * relationship signal
 * derived from `player.tags`. The list is one bounded, deduped set — the
 * client scrolls it locally; there is no paging.
 *
 * testID="roster-picker" and testID="roster-chip-{id}" are preserved for
 * existing tests.
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import {
  View,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import type { PlayerSearchTag } from '@beach-kings/shared';
import type { RosterPlayer } from './useScoreGameScreen';
import type { PlayerSlot } from './useScoreGameScreen';
import Avatar from '@/components/ui/Avatar';
import type { AvatarVariant } from '@/components/ui/Avatar';
import { SearchIcon, PlusIcon, XIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';

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

/** Pill copy + tone per relevance tag. Order in PILL_ORDER == display order. */
const PILL_ORDER: readonly PlayerSearchTag[] = [
  'in_league',
  'shared_league',
  'friend',
  'recent_opp',
];

const TAG_LABEL: Record<PlayerSearchTag, string> = {
  in_league: 'In league',
  shared_league: 'Shared league',
  friend: 'Friend',
  recent_opp: 'Recent opp',
};

const TAG_TONE: Record<PlayerSearchTag, 'teal' | 'gold'> = {
  in_league: 'teal',
  shared_league: 'teal',
  friend: 'teal',
  recent_opp: 'gold',
};

function orderedTags(
  tags: readonly PlayerSearchTag[],
): readonly PlayerSearchTag[] {
  return PILL_ORDER.filter((t) => tags.includes(t)).slice(0, 1);
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

  const avatarVariant: AvatarVariant = badge === 'T1'
    ? 'teal'
    : badge === 'T2'
    ? 'gold'
    : 'muted';

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
      <Avatar
        name={player.display_name}
        imageUrl={player.avatar_url}
        size="sm"
        variant={avatarVariant}
      />
      <AppText
        className={`text-[13px] font-semibold ${
          badge === 'T1' ? 'text-brand-teal' : badge === 'T2' ? 'text-warning' : 'text-default'
        }`}
      >
        {player.display_name}
      </AppText>
      {badge != null && (
        <View
          className={`px-[5px] py-[1px] rounded-[4px] ${
            badge === 'T1' ? 'bg-info-tint' : 'bg-warning-tint'
          }`}
        >
          <AppText
            className={`text-[9px] font-bold ${
              badge === 'T1' ? 'text-brand-teal' : 'text-warning'
            }`}
          >
            {badge}
          </AppText>
        </View>
      )}
      {showYouPill && (
        <View
          testID={`roster-chip-${player.player_id}-you-badge`}
          className="px-[5px] py-[1px] rounded-[4px] bg-brand-gold"
        >
          <AppText className="text-[9px] font-bold text-on-brand-gold">YOU</AppText>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Ranked row (with relevance pills)
// ---------------------------------------------------------------------------

interface PlayerRowProps {
  readonly player: RosterPlayer;
  readonly badge: 'T1' | 'T2' | null;
  readonly onPress: (player: RosterPlayer) => void;
}

function PillBadge({ tag }: { readonly tag: PlayerSearchTag }): React.ReactNode {
  const tone = TAG_TONE[tag];
  const box = tone === 'teal' ? 'bg-info-tint' : 'bg-warning-tint';
  const text = tone === 'teal' ? 'text-brand-teal' : 'text-warning';
  return (
    <View
      testID={`roster-pill-${tag}`}
      className={`px-[6px] py-[1px] rounded-[4px] ${box}`}
    >
      <AppText className={`text-[10px] font-bold ${text}`}>{TAG_LABEL[tag]}</AppText>
    </View>
  );
}

function PlayerRow({ player, badge, onPress }: PlayerRowProps): React.ReactNode {
  const handlePress = useCallback(() => onPress(player), [onPress, player]);
  const isSeated = badge != null;
  const pills = orderedTags(player.tags);

  return (
    <View
      testID={`roster-row-${player.player_id}`}
      className={`flex-row items-center gap-3 py-[10px] border-b border-divider min-h-[58px] ${
        isSeated ? 'opacity-50' : ''
      }`}
    >
      <Avatar
        name={player.display_name}
        imageUrl={player.avatar_url}
        size="sm"
        colorSeed={player.player_id}
      />
      <View className="flex-1 min-w-0">
        <AppText className="text-[14px] font-semibold text-default">
          {player.display_name}
        </AppText>
        {pills.length > 0 && (
          <View className="flex-row items-center flex-wrap gap-[5px] mt-[3px]">
            {pills.map((tag) => (
              <PillBadge key={tag} tag={tag} />
            ))}
          </View>
        )}
      </View>
      <Pressable
        testID={`roster-chip-${player.player_id}`}
        onPress={handlePress}
        disabled={isSeated}
        accessibilityRole="button"
        accessibilityLabel={`Add ${player.display_name}`}
        className="px-4 py-2 rounded-[20px] border border-brand-teal min-h-touch items-center justify-center"
      >
        <AppText className="text-[13px] font-bold text-brand-teal">
          {badge != null ? badge : 'Add'}
        </AppText>
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
  testID,
}: {
  readonly label: string;
  readonly count?: string;
  readonly testID?: string;
}): React.ReactNode {
  return (
    <View
      testID={testID}
      className="flex-row items-center gap-2 pt-3 pb-2"
    >
      <AppText className="text-[11px] font-bold text-muted uppercase tracking-wider">
        {label}
      </AppText>
      {count != null && (
        <AppText className="text-[11px] text-muted">{count}</AppText>
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
  const palette = usePaletteColors();
  const title = searchQuery.trim()
    ? `Add "${searchQuery.trim()}" as a New Player`
    : 'Add a New Player';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="my-3 flex-row items-center gap-[10px] rounded-[12px] border border-dashed border-brand-gold bg-warning-tint px-[14px] py-3"
    >
      <View className="w-[30px] h-[30px] rounded-full bg-brand-gold items-center justify-center">
        <PlusIcon size={16} color={palette.onBrandGold} />
      </View>
      <View className="flex-1 min-w-0">
        <AppText className="text-[13px] font-bold text-warning">
          {title}
        </AppText>
        <AppText className="text-[11px] text-warning">
          Invite them to the app later to claim their games
        </AppText>
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
  /** True while a debounced backend search is in flight. */
  readonly isSearching?: boolean;
  /**
   * Called when the search input gains/loses focus. The parent uses this to
   * collapse the scoreboard while the keyboard is up, freeing vertical space
   * for the results list.
   */
  readonly onSearchFocusChange?: (focused: boolean) => void;
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
  isSearching = false,
  onSearchFocusChange,
}: RosterPickerProps): React.ReactNode {
  const palette = usePaletteColors();
  const handleClearSearch = useCallback(() => onSearch(''), [onSearch]);
  const handleSearchFocus = useCallback(
    () => onSearchFocusChange?.(true),
    [onSearchFocusChange],
  );
  const handleSearchBlur = useCallback(
    () => onSearchFocusChange?.(false),
    [onSearchFocusChange],
  );

  const showClear = search.length > 0;

  // Single ranked list — session players lead as compact chips, everyone
  // else follows as rows. Order is preserved from the backend ranking.
  const sessionPlayers = roster.filter((p) => p.isSession);
  const rowPlayers = roster.filter((p) => !p.isSession);
  const hasSessionSection = sessionPlayers.length > 0;

  const seatedCount = sessionPlayers.filter(
    (p) => isOnTeam(p, team1) || isOnTeam(p, team2),
  ).length;

  const showEmpty =
    !hasSessionSection && rowPlayers.length === 0 && !isSearching;

  return (
    <View testID="roster-picker" className="flex-1 bg-page border-t border-divider">
      {/* Search */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2 bg-surface border border-divider rounded-[12px] px-3 py-[10px] min-h-[44px]">
          <SearchIcon size={16} color={palette.textTertiary} />
          <TextInput
            testID="roster-search-input"
            accessibilityLabel="Search players"
            value={search}
            onChangeText={onSearch}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            placeholder="Search players..."
            placeholderTextColor={palette.textTertiary}
            className="flex-1 text-[15px] text-default"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {isSearching && (
            <ActivityIndicator
              testID="roster-search-spinner"
              size="small"
              color={palette.textTertiary}
            />
          )}
          {showClear && (
            <Pressable
              testID="roster-search-clear"
              onPress={handleClearSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              className="h-6 w-6 items-center justify-center rounded-full bg-elevated"
            >
              <XIcon size={12} color={palette.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Virtualized: the ranked roster can run to hundreds of rows (whole
          network, capped backend-side). Session players lead in the header as
          compact chips; the Add-New CTA is a pinned footer so it's reachable
          regardless of list length. */}
      <FlatList
        className="flex-1"
        data={rowPlayers}
        keyExtractor={(item) => String(item.player_id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // iOS floats the keyboard over content without resizing the window, so
        // the bottom rows + the Add-New-Player CTA would otherwise be trapped
        // behind it. This adds a matching bottom inset so they scroll into
        // view. No-op on Android (window resizes via Expo's `resize` mode).
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        renderItem={({ item }) => (
          <PlayerRow
            player={item}
            badge={teamBadge(item, team1, team2)}
            onPress={onSelectPlayer}
          />
        )}
        ListHeaderComponent={
          hasSessionSection ? (
            <>
              {/* In this session — compact chip layout. */}
              <SectionLabel
                testID="roster-section-session"
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
              {/* Divider before the ranked rows. No bucket headers — order is
                  the backend's additive score; pills convey the relationship. */}
              {rowPlayers.length > 0 && (
                <SectionLabel
                  testID="roster-section-ranked"
                  label="More players"
                />
              )}
            </>
          ) : null
        }
        ListEmptyComponent={
          showEmpty ? (
            <AppText className="text-[13px] text-muted italic py-4 text-center">
              {search.trim()
                ? 'No players match your search.'
                : 'Search for a player to add them.'}
            </AppText>
          ) : null
        }
        ListFooterComponent={
          <AddNewCta searchQuery={search} onPress={onAddNewPlayer} />
        }
      />
    </View>
  );
}
