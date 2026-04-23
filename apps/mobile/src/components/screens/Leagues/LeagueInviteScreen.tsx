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
import type { InvitablePlayer } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Section label used between player groups
// ---------------------------------------------------------------------------

function SectionLabel({ title }: { readonly title: string }): React.ReactNode {
  return (
    <Text className="text-[11px] font-bold text-text-secondary dark:text-content-secondary uppercase tracking-wider px-4 pt-4 pb-2">
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
      className: 'bg-green-100 dark:bg-green-900/30',
      textClassName: 'text-green-700 dark:text-green-400',
    },
    invited: {
      label: 'Invited',
      className: 'bg-[#c8a84b]/20',
      textClassName: 'text-[#c8a84b]',
    },
    requested: {
      label: 'Requested',
      className: 'bg-[#f0f0f0] dark:bg-dark-elevated',
      textClassName: 'text-text-secondary dark:text-content-secondary',
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
      className={`flex-row items-center px-4 py-[12px] border-b border-[#f0f0f0] dark:border-border-subtle gap-3 ${
        isDisabled ? 'opacity-50' : 'active:opacity-70'
      }`}
    >
      {/* Checkbox */}
      <View
        testID={`invite-checkbox-${player.player_id}`}
        className={`w-5 h-5 rounded-[4px] border-2 items-center justify-center flex-shrink-0 ${
          isSelected
            ? 'bg-[#1a3a4a] dark:bg-brand-teal border-[#1a3a4a] dark:border-brand-teal'
            : 'border-[#ccc] dark:border-border-strong'
        }`}
      >
        {isSelected && (
          <Text className="text-[11px] font-bold text-white">✓</Text>
        )}
      </View>

      {/* Avatar */}
      <View className="w-9 h-9 rounded-full bg-[#1a3a4a] dark:bg-brand-teal/40 items-center justify-center flex-shrink-0">
        <Text className="text-[10px] font-bold text-white dark:text-brand-teal">
          {player.initials}
        </Text>
      </View>

      {/* Name / meta */}
      <View className="flex-1 min-w-0">
        <Text
          className="text-[14px] font-semibold text-text-default dark:text-content-primary"
          numberOfLines={1}
        >
          {player.display_name}
        </Text>
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
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
    onChangeSearch,
    onTogglePlayer,
    onSendInvites,
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
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Invite Players" showBack />
      <KeyboardAvoidingView
      testID="league-invite-screen"
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Search bar */}
      <View className="bg-white dark:bg-dark-surface px-4 py-3 border-b border-[#e8e8e8] dark:border-border-subtle">
        <View className="flex-row items-center bg-[#f0f0f0] dark:bg-dark-elevated rounded-[10px] px-3 py-[10px] gap-2">
          <Text className="text-[14px] text-text-muted dark:text-content-tertiary">🔍</Text>
          <TextInput
            testID="invite-search-input"
            value={searchQuery}
            onChangeText={onChangeSearch}
            placeholder="Search players..."
            placeholderTextColor="#999"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-[14px] text-text-default dark:text-content-primary"
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
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary text-center">
            Failed to load players
          </Text>
        </View>
      ) : listItems.length === 0 ? (
        <View testID="invite-empty" className="flex-1 items-center justify-center px-8">
          <Text className="text-[18px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
            No Players Found
          </Text>
          <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center">
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
          className="flex-1 bg-white dark:bg-dark-surface"
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom action bar */}
      <View className="bg-white dark:bg-dark-surface px-4 py-4 border-t border-[#e8e8e8] dark:border-border-subtle flex-row gap-3">
        <Pressable
          testID="share-link-button"
          onPress={() => {
            void hapticLight();
            // TODO(backend): share league invite link
          }}
          className="flex-1 rounded-[12px] py-[12px] items-center border border-[#1a3a4a] dark:border-brand-teal active:opacity-70"
        >
          <Text className="text-[14px] font-semibold text-[#1a3a4a] dark:text-brand-teal">
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
              ? 'bg-[#1a3a4a] dark:bg-brand-teal active:opacity-80'
              : 'bg-[#ccc] dark:bg-dark-elevated'
          }`}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text
              className={`text-[14px] font-bold ${
                selectedIds.size > 0 ? 'text-white' : 'text-text-muted dark:text-content-tertiary'
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
