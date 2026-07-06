/**
 * LeagueInviteScreen — Invite players to a league.
 *
 * Shows:
 *   Search input (filters by name)
 *   Grouped player list: Friends / Recent Opponents / Suggested
 *   Rows have checkbox, avatar, name, level/location, status badge
 *   Rows with status member/invited/requested are non-selectable
 *   Bottom action bar: Share Link button + Send Invites (N) button
 *
 * Wireframe ref: league-invite.html
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { useLeagueInviteScreen } from './useLeagueInviteScreen';
import type { InvitablePlayer } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Section label used between player groups
// ---------------------------------------------------------------------------

function SectionLabel({ title }: { readonly title: string }): React.ReactNode {
  return (
    <Text className="text-[11px] font-bold text-muted uppercase tracking-wider px-4 pt-4 pb-2">
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  readonly status: InvitablePlayer['invite_status'];
}): React.ReactNode | null {
  if (status === 'none') return null;

  const config: Record<
    Exclude<InvitablePlayer['invite_status'], 'none'>,
    { label: string; className: string; textClassName: string }
  > = {
    member: {
      label: 'Member',
      className: 'bg-success-tint',
      textClassName: 'text-success',
    },
    invited: {
      label: 'Invited',
      className: 'bg-warning-tint',
      textClassName: 'text-warning',
    },
    requested: {
      label: 'Requested',
      className: 'bg-elevated',
      textClassName: 'text-muted',
    },
  };

  const { label, className: wrapClass, textClassName } = config[status];

  return (
    <View className={`rounded-[6px] px-2 py-[2px] ${wrapClass}`}>
      <Text className={`text-[10px] font-bold ${textClassName}`}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Player row
// ---------------------------------------------------------------------------

interface PlayerRowProps {
  readonly player: InvitablePlayer;
  readonly isSelected: boolean;
  readonly onToggle: (id: number) => void;
}

function PlayerRow({ player, isSelected, onToggle }: PlayerRowProps): React.ReactNode {
  const isDisabled =
    player.invite_status === 'member' ||
    player.invite_status === 'invited' ||
    player.invite_status === 'requested';

  const handlePress = (): void => {
    if (isDisabled) return;
    void hapticLight();
    onToggle(player.player_id);
  };

  return (
    <Pressable
      testID={`invite-player-row-${player.player_id}`}
      onPress={handlePress}
      disabled={isDisabled}
      className={`flex-row items-center px-4 py-[12px] border-b border-divider gap-3 ${
        isDisabled ? 'opacity-50' : 'active:opacity-70'
      }`}
    >
      {/* Checkbox */}
      <View
        testID={`invite-checkbox-${player.player_id}`}
        className={`w-5 h-5 rounded-[4px] border-2 items-center justify-center flex-shrink-0 ${
          isSelected
            ? 'bg-brand-teal border-brand-teal'
            : 'border-strong'
        }`}
      >
        {isSelected && (
          <Text className="text-[11px] font-bold text-white">✓</Text>
        )}
      </View>

      {/* Avatar */}
      <View className="w-9 h-9 rounded-full bg-brand-teal items-center justify-center flex-shrink-0">
        <Text className="text-[10px] font-bold text-white">
          {player.initials}
        </Text>
      </View>

      {/* Name / meta */}
      <View className="flex-1 min-w-0">
        <Text
          className="text-[14px] font-semibold text-default"
          numberOfLines={1}
        >
          {player.display_name}
        </Text>
        <Text className="text-[12px] text-muted">
          {[player.level, player.location_name].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {/* Status badge */}
      <StatusBadge status={player.invite_status} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Section header item for FlatList
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<InvitablePlayer['section'], string> = {
  friends: 'Friends',
  recent_opponents: 'Recent Opponents',
  suggested: 'Suggested',
};

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

interface LeagueInviteScreenProps {
  readonly leagueId: number | string;
}

type ListItem =
  | { type: 'header'; section: InvitablePlayer['section'] }
  | { type: 'player'; player: InvitablePlayer };

function buildListItems(players: InvitablePlayer[]): ListItem[] {
  const items: ListItem[] = [];
  const sections: InvitablePlayer['section'][] = [
    'friends',
    'recent_opponents',
    'suggested',
  ];

  for (const section of sections) {
    const sectionPlayers = players.filter((p) => p.section === section);
    if (sectionPlayers.length === 0) continue;
    items.push({ type: 'header', section });
    for (const player of sectionPlayers) {
      items.push({ type: 'player', player });
    }
  }
  return items;
}

export default function LeagueInviteScreen({
  leagueId,
}: LeagueInviteScreenProps): React.ReactNode {
  const {
    players,
    isLoading,
    isError,
    searchQuery,
    selectedIds,
    isSending,
    inviteError,
    onChangeSearch,
    onTogglePlayer,
    onSendInvites,
    onClearInviteError,
  } = useLeagueInviteScreen(leagueId);

  const listItems = buildListItems(players);

  const renderItem = ({ item }: { item: ListItem }): React.ReactElement | null => {
    if (item.type === 'header') {
      return <SectionLabel title={SECTION_LABELS[item.section]} />;
    }
    return (
      <PlayerRow
        player={item.player}
        isSelected={selectedIds.has(item.player.player_id)}
        onToggle={onTogglePlayer}
      />
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Invite Players" showBack />
      <KeyboardAvoidingView
      testID="league-invite-screen"
      className="flex-1 bg-page"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Search bar */}
      <View className="bg-surface px-4 py-3 border-b border-divider">
        <View className="flex-row items-center bg-elevated rounded-[10px] px-3 py-[10px] gap-2">
          <Text className="text-[14px] text-tertiary">🔍</Text>
          <TextInput
            testID="invite-search-input"
            value={searchQuery}
            onChangeText={onChangeSearch}
            placeholder="Search players..."
            placeholderTextColor="#999"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-[14px] text-default"
          />
        </View>
      </View>

      {/* Player list */}
      {isLoading ? (
        <View testID="invite-loading" className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : isError ? (
        <View testID="invite-error" className="flex-1 items-center justify-center px-8">
          <Text className="text-[15px] font-bold text-default text-center">
            Failed to load players
          </Text>
        </View>
      ) : listItems.length === 0 ? (
        <View testID="invite-empty" className="flex-1 items-center justify-center px-8">
          <Text className="text-[18px] font-bold text-default mb-2 text-center">
            No Players Found
          </Text>
          <Text className="text-[14px] text-tertiary text-center">
            Try a different search term.
          </Text>
        </View>
      ) : (
        <FlatList<ListItem>
          testID="invite-player-list"
          data={listItems}
          keyExtractor={(item, idx) =>
            item.type === 'header' ? `header-${item.section}` : `player-${item.player.player_id}-${idx}`
          }
          renderItem={renderItem}
          className="flex-1 bg-surface"
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Inline error banner */}
      {inviteError ? (
        <Pressable
          testID="invite-error-banner"
          onPress={onClearInviteError}
          className="bg-danger-tint px-4 py-3 border-t border-divider"
        >
          <Text className="text-[13px] text-danger font-semibold">
            {inviteError}
          </Text>
          <Text className="text-[11px] text-danger mt-[2px]">Tap to dismiss</Text>
        </Pressable>
      ) : null}

      {/* Bottom action bar */}
      <View className="bg-surface px-4 py-4 border-t border-divider flex-row gap-3">
        <Pressable
          testID="share-link-button"
          onPress={() => {
            void hapticLight();
            // TODO(backend): share league invite link
          }}
          className="flex-1 rounded-[12px] py-[12px] items-center border border-brand-teal active:opacity-70"
        >
          <Text className="text-[14px] font-semibold text-brand-teal">
            Share Link
          </Text>
        </Pressable>

        <Pressable
          testID="send-invites-button"
          onPress={() => {
            void hapticMedium();
            void onSendInvites();
          }}
          disabled={selectedIds.size === 0 || isSending}
          className={`flex-1 rounded-[12px] py-[12px] items-center ${
            selectedIds.size > 0 && !isSending
              ? 'bg-brand-teal active:opacity-80'
              : 'bg-elevated'
          }`}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text
              className={`text-[14px] font-bold ${
                selectedIds.size > 0 ? 'text-white' : 'text-tertiary'
              }`}
            >
              {selectedIds.size > 0 ? `Send (${selectedIds.size})` : 'Send'}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
