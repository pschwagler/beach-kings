/**
 * LeagueDashboardTab — Standings tab of the League Detail screen.
 *
 * Shows:
 *   Season picker (horizontal scroll pills)
 *   Standings table: # | Player | W-L | Win% | Rating
 *   Season Info card below the table
 *
 * Wireframe ref: league-dashboard.html (Standings tab)
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { hapticLight } from '@/utils/haptics';
import { useLeagueDashboardTab } from './useLeagueDashboardTab';
import type { LeagueStanding } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Season picker
// ---------------------------------------------------------------------------

interface SeasonPickerProps {
  readonly seasons: readonly { id: number; name: string; is_active: boolean }[];
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
}

function SeasonPicker({ seasons, selectedId, onSelect }: SeasonPickerProps): React.ReactNode {
  if (seasons.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}
    >
      {seasons.map((s) => {
        const isActive = selectedId === s.id || (selectedId === null && s.is_active);
        return (
          <Pressable
            key={s.id}
            testID={`season-pill-${s.id}`}
            onPress={() => {
              void hapticLight();
              onSelect(s.id);
            }}
            className={`px-[14px] py-[8px] rounded-full border ${
              isActive
                ? 'bg-[#1a3a4a] dark:bg-brand-teal border-[#1a3a4a] dark:border-brand-teal'
                : 'bg-white dark:bg-dark-surface border-[#ddd] dark:border-border-strong'
            } active:opacity-70`}
          >
            <Text
              className={`text-[12px] font-semibold ${
                isActive
                  ? 'text-white'
                  : 'text-text-secondary dark:text-content-secondary'
              }`}
            >
              {s.name}
              {s.is_active ? ' (Active)' : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Standings table row
// ---------------------------------------------------------------------------

interface StandingsRowProps {
  readonly standing: LeagueStanding;
  readonly onPress: (playerId: number) => void;
}

function StandingsRow({ standing, onPress }: StandingsRowProps): React.ReactNode {
  const ratingDelta = standing.rating_delta;

  return (
    <Pressable
      testID={`standings-row-${standing.player_id}`}
      onPress={() => {
        void hapticLight();
        onPress(standing.player_id);
      }}
      className="flex-row items-center px-4 py-[12px] border-b border-[#f0f0f0] dark:border-border-subtle bg-white dark:bg-dark-surface active:opacity-70"
    >
      {/* Rank */}
      <Text className="w-8 text-[13px] font-bold text-text-secondary dark:text-content-secondary">
        {standing.rank}
      </Text>

      {/* Avatar + Name */}
      <View className="flex-1 flex-row items-center gap-2 min-w-0">
        <View className="w-8 h-8 rounded-full bg-[#1a3a4a] dark:bg-brand-teal items-center justify-center flex-shrink-0">
          <Text className="text-[10px] font-bold text-white">{standing.initials}</Text>
        </View>
        <Text
          className="text-[14px] font-semibold text-text-default dark:text-content-primary"
          numberOfLines={1}
        >
          {standing.display_name}
        </Text>
      </View>

      {/* W-L */}
      <Text className="w-12 text-[13px] text-text-secondary dark:text-content-secondary text-center">
        {standing.wins}-{standing.losses}
      </Text>

      {/* Win% */}
      <Text className="w-12 text-[13px] text-text-secondary dark:text-content-secondary text-center">
        {standing.win_rate}%
      </Text>

      {/* Rating */}
      <View className="w-16 items-end">
        <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
          {standing.rating}
        </Text>
        {ratingDelta != null && (
          <Text
            className={`text-[10px] font-medium ${
              ratingDelta >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-500 dark:text-red-400'
            }`}
          >
            {ratingDelta >= 0 ? '+' : ''}
            {ratingDelta}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Standings table header
// ---------------------------------------------------------------------------

function StandingsHeader(): React.ReactNode {
  return (
    <View className="flex-row items-center px-4 py-[8px] bg-[#f8f8f8] dark:bg-dark-elevated border-b border-[#e8e8e8] dark:border-border-subtle">
      <Text className="w-8 text-[11px] font-bold text-text-secondary dark:text-content-tertiary uppercase">#</Text>
      <Text className="flex-1 text-[11px] font-bold text-text-secondary dark:text-content-tertiary uppercase">
        Player
      </Text>
      <Text className="w-12 text-[11px] font-bold text-text-secondary dark:text-content-tertiary uppercase text-center">
        W-L
      </Text>
      <Text className="w-12 text-[11px] font-bold text-text-secondary dark:text-content-tertiary uppercase text-center">
        Win%
      </Text>
      <Text className="w-16 text-[11px] font-bold text-text-secondary dark:text-content-tertiary uppercase text-right">
        Rating
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Season info card
// ---------------------------------------------------------------------------

interface SeasonInfoCardProps {
  readonly name: string;
  readonly startedAt: string;
  readonly sessionCount: number;
  readonly gameCount: number;
}

function SeasonInfoCard({
  name,
  startedAt,
  sessionCount,
  gameCount,
}: SeasonInfoCardProps): React.ReactNode {
  const startDate = new Date(startedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View
      testID="season-info-card"
      className="mx-4 mt-4 mb-2 bg-white dark:bg-dark-surface rounded-[12px] border border-[#e8e8e8] dark:border-border-subtle p-4"
    >
      <Text className="text-[13px] font-bold text-text-default dark:text-content-primary mb-3">
        Season Info
      </Text>
      <View className="flex-row flex-wrap gap-y-2">
        <View className="w-1/2">
          <Text className="text-[11px] text-text-secondary dark:text-content-secondary uppercase tracking-wide">
            Season
          </Text>
          <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
            {name}
          </Text>
        </View>
        <View className="w-1/2">
          <Text className="text-[11px] text-text-secondary dark:text-content-secondary uppercase tracking-wide">
            Started
          </Text>
          <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
            {startDate}
          </Text>
        </View>
        <View className="w-1/2">
          <Text className="text-[11px] text-text-secondary dark:text-content-secondary uppercase tracking-wide">
            Sessions
          </Text>
          <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
            {sessionCount}
          </Text>
        </View>
        <View className="w-1/2">
          <Text className="text-[11px] text-text-secondary dark:text-content-secondary uppercase tracking-wide">
            Total Games
          </Text>
          <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
            {gameCount}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface LeagueDashboardTabProps {
  readonly leagueId: number | string;
}

export default function LeagueDashboardTab({ leagueId }: LeagueDashboardTabProps): React.ReactNode {
  const {
    standings,
    seasonInfo,
    seasons,
    selectedSeasonId,
    isLoading,
    isError,
    onSelectSeason,
    onPressPlayer,
  } = useLeagueDashboardTab(leagueId);

  if (isLoading) {
    return (
      <View testID="standings-loading" className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        testID="standings-error"
        className="flex-1 items-center justify-center px-8"
      >
        <Text className="text-[16px] font-bold text-text-default dark:text-content-primary text-center mb-2">
          Failed to load standings
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="standings-tab"
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      showsVerticalScrollIndicator={false}
    >
      <SeasonPicker
        seasons={seasons}
        selectedId={selectedSeasonId}
        onSelect={onSelectSeason}
      />

      <View className="bg-white dark:bg-dark-surface rounded-[12px] mx-4 border border-[#e8e8e8] dark:border-border-subtle overflow-hidden mb-2">
        <StandingsHeader />
        {standings.map((s) => (
          <StandingsRow key={s.player_id} standing={s} onPress={onPressPlayer} />
        ))}
        {standings.length === 0 && (
          <View className="py-10 items-center">
            <Text className="text-[14px] text-text-muted dark:text-content-tertiary">
              No standings yet
            </Text>
          </View>
        )}
      </View>

      {seasonInfo != null && (
        <SeasonInfoCard
          name={seasonInfo.name}
          startedAt={seasonInfo.started_at}
          sessionCount={seasonInfo.session_count}
          gameCount={seasonInfo.game_count}
        />
      )}

      <View className="h-8" />
    </ScrollView>
  );
}
