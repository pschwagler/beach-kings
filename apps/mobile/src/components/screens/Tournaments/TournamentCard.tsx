/**
 * TournamentCard — renders a tournament in Active, Upcoming, Nearby, or Past variant.
 *
 * Wireframe ref: tournaments.html
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, TouchableOpacity } from 'react-native';
import type { KobTournament } from '@beach-kings/shared';
import { hapticLight } from '@/utils/haptics';
import { pluralize } from '@/lib/formatters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoDate: string | null): string {
  if (isoDate == null) return 'TBD';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatBadge(tournament: KobTournament): string {
  if (tournament.format === 'POOLS_PLAYOFFS') return 'King of the Beach';
  if (tournament.format === 'FULL_ROUND_ROBIN') return 'Round Robin';
  return tournament.format;
}

const GENDER_LABELS: Record<string, string> = {
  coed: 'Coed',
  mens: "Men's",
  womens: "Women's",
};

// ---------------------------------------------------------------------------
// Active tournament card
// ---------------------------------------------------------------------------

interface ActiveCardProps {
  readonly tournament: KobTournament;
  readonly onPress: () => void;
}

function ActiveCard({ tournament, onPress }: ActiveCardProps): React.ReactNode {
  return (
    <TouchableOpacity
      onPress={onPress}
      testID={`tournament-active-card-${tournament.id}`}
      className="bg-surface rounded-[14px] border border-divider p-[14px] mb-[12px]"
    >
      <View className="flex-row items-center gap-[6px] mb-[8px]">
        <View className="w-[8px] h-[8px] rounded-full bg-danger-fill" />
        <AppText className="text-[11px] font-bold text-danger">
          Live · Round {tournament.current_round} of {tournament.num_courts * 2}
        </AppText>
      </View>
      <AppText className="text-[16px] font-bold text-default mb-[6px]">
        {tournament.name}
      </AppText>
      <View className="flex-row gap-[6px] flex-wrap">
        <View className="bg-info-tint px-[8px] py-[3px] rounded-[10px]">
          <AppText className="text-[11px] font-semibold text-brand-teal">{formatBadge(tournament)}</AppText>
        </View>
        <View className="bg-elevated px-[8px] py-[3px] rounded-[10px]">
          <AppText className="text-[11px] text-muted">
            {pluralize(tournament.player_count, 'player')}
          </AppText>
        </View>
        <View className="bg-elevated px-[8px] py-[3px] rounded-[10px]">
          <AppText className="text-[11px] text-muted">
            {GENDER_LABELS[tournament.gender] ?? tournament.gender}
          </AppText>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Upcoming / list row card
// ---------------------------------------------------------------------------

interface ListCardProps {
  readonly tournament: KobTournament;
  readonly onPress: () => void;
}

function ListCard({ tournament, onPress }: ListCardProps): React.ReactNode {
  return (
    <TouchableOpacity
      onPress={onPress}
      testID={`tournament-list-card-${tournament.id}`}
      className="bg-surface rounded-[12px] border border-divider p-[12px] mb-[8px] flex-row items-center gap-[12px]"
    >
      {/* Icon block */}
      <View className="w-[44px] h-[44px] rounded-[10px] bg-info-tint items-center justify-center">
        <AppText className="text-[18px]">🏐</AppText>
      </View>

      {/* Info */}
      <View className="flex-1">
        <AppText className="text-[14px] font-semibold text-default" numberOfLines={1}>
          {tournament.name}
        </AppText>
        <AppText className="text-[12px] text-muted mt-[2px]">
          {formatBadge(tournament)} · {GENDER_LABELS[tournament.gender] ?? tournament.gender}
        </AppText>
      </View>

      {/* Date + badge */}
      <View className="items-end">
        <AppText className="text-[11px] text-muted">
          {formatDate(tournament.scheduled_date)}
        </AppText>
        <View className="bg-elevated px-[6px] py-[2px] rounded-[6px] mt-[4px]">
          <AppText className="text-[10px] font-semibold text-muted">
            {tournament.player_count} player{tournament.player_count === 1 ? '' : 's'}
          </AppText>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Past tournament card
// ---------------------------------------------------------------------------

interface PastCardProps {
  readonly tournament: KobTournament;
  readonly onPress: () => void;
}

function PastCard({ tournament, onPress }: PastCardProps): React.ReactNode {
  return (
    <TouchableOpacity
      onPress={onPress}
      testID={`tournament-past-card-${tournament.id}`}
      className="bg-surface rounded-[12px] border border-divider p-[12px] mb-[8px] flex-row items-center gap-[12px]"
    >
      <View className="w-[44px] h-[44px] rounded-[10px] bg-elevated items-center justify-center">
        <AppText className="text-[18px]">🏆</AppText>
      </View>
      <View className="flex-1">
        <AppText className="text-[14px] font-semibold text-default" numberOfLines={1}>
          {tournament.name}
        </AppText>
        <AppText className="text-[12px] text-muted mt-[2px]">
          {formatDate(tournament.scheduled_date)} · {pluralize(tournament.player_count, 'player')}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Create CTA card
// ---------------------------------------------------------------------------

interface CreateCTAProps {
  readonly onPress: () => void;
}

function CreateCTA({ onPress }: CreateCTAProps): React.ReactNode {
  return (
    <TouchableOpacity
      onPress={() => { void hapticLight(); onPress(); }}
      testID="tournaments-create-cta"
      className="border-2 border-dashed border-brand-gold rounded-[12px] items-center justify-center py-[20px] mt-[8px]"
    >
      <AppText className="text-[14px] font-bold text-accent">+ Create Tournament</AppText>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { ActiveCard, ListCard, PastCard, CreateCTA };
export default ListCard;
