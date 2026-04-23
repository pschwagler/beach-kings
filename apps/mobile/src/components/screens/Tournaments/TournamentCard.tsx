/**
 * TournamentCard — renders a tournament in Active, Upcoming, Nearby, or Past variant.
 *
 * Wireframe ref: tournaments.html
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { KobTournament } from '@beach-kings/shared';
import { hapticLight } from '@/utils/haptics';

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
      className="bg-white dark:bg-[#1a1a1a] rounded-[14px] border border-[#eee] dark:border-[#2a2a2a] p-[14px] mb-[12px]"
    >
      <View className="flex-row items-center gap-[6px] mb-[8px]">
        <View className="w-[8px] h-[8px] rounded-full bg-[#dc2626]" />
        <Text className="text-[11px] font-bold text-[#dc2626]">
          Live · Round {tournament.current_round} of {tournament.num_courts * 2}
        </Text>
      </View>
      <Text className="text-[16px] font-bold text-text-default dark:text-content-primary mb-[6px]">
        {tournament.name}
      </Text>
      <View className="flex-row gap-[6px] flex-wrap">
        <View className="bg-[#e8f4f8] px-[8px] py-[3px] rounded-[10px]">
          <Text className="text-[11px] font-semibold text-[#2a7d9c]">{formatBadge(tournament)}</Text>
        </View>
        <View className="bg-[#f0f0f0] dark:bg-[#2a2a2a] px-[8px] py-[3px] rounded-[10px]">
          <Text className="text-[11px] text-text-secondary dark:text-content-secondary">
            {tournament.player_count} players
          </Text>
        </View>
        <View className="bg-[#f0f0f0] dark:bg-[#2a2a2a] px-[8px] py-[3px] rounded-[10px]">
          <Text className="text-[11px] text-text-secondary dark:text-content-secondary">
            {GENDER_LABELS[tournament.gender] ?? tournament.gender}
          </Text>
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
      className="bg-white dark:bg-[#1a1a1a] rounded-[12px] border border-[#eee] dark:border-[#2a2a2a] p-[12px] mb-[8px] flex-row items-center gap-[12px]"
    >
      {/* Icon block */}
      <View className="w-[44px] h-[44px] rounded-[10px] bg-[#e8f4f8] items-center justify-center">
        <Text className="text-[18px]">🏐</Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary" numberOfLines={1}>
          {tournament.name}
        </Text>
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]">
          {formatBadge(tournament)} · {GENDER_LABELS[tournament.gender] ?? tournament.gender}
        </Text>
      </View>

      {/* Date + badge */}
      <View className="items-end">
        <Text className="text-[11px] text-text-secondary dark:text-content-secondary">
          {formatDate(tournament.scheduled_date)}
        </Text>
        <View className="bg-[#f0f0f0] dark:bg-[#2a2a2a] px-[6px] py-[2px] rounded-[6px] mt-[4px]">
          <Text className="text-[10px] font-semibold text-text-secondary dark:text-content-secondary">
            {tournament.player_count} / {tournament.player_count + 4}
          </Text>
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
      className="bg-white dark:bg-[#1a1a1a] rounded-[12px] border border-[#eee] dark:border-[#2a2a2a] p-[12px] mb-[8px] flex-row items-center gap-[12px]"
    >
      <View className="w-[44px] h-[44px] rounded-[10px] bg-[#f5f5f5] dark:bg-[#2a2a2a] items-center justify-center">
        <Text className="text-[18px]">🏆</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary" numberOfLines={1}>
          {tournament.name}
        </Text>
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]">
          {formatDate(tournament.scheduled_date)} · {tournament.player_count} players
        </Text>
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
      className="border-2 border-dashed border-[#d4a843] rounded-[12px] items-center justify-center py-[20px] mt-[8px]"
    >
      <Text className="text-[14px] font-bold text-[#d4a843]">+ Create Tournament</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { ActiveCard, ListCard, PastCard, CreateCTA };
export default ListCard;
