/**
 * LeagueDashboardTab — Standings tab of the League Detail screen.
 *
 * Shows:
 *   Season picker (horizontal scroll pills)
 *   Standings table: # | Player | W-L | Win% | PTS/Rating (sortable)
 *   Season Info card below the table
 */

import React, { useMemo, useState } from 'react';
import AppText from '@/components/ui/AppText';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import LeagueStandingsTable from './LeagueStandingsTable';
import { hapticLight } from '@/utils/haptics';
import { useLeagueDashboardTab } from './useLeagueDashboardTab';
import type { LeagueStanding, LeagueSeasonInfo } from '@beach-kings/shared';

type SortField = 'rank' | 'name' | 'wins' | 'win_rate' | 'rating';
type SortDir = 'asc' | 'desc';

function lastNameKey(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const last = parts.length > 0 ? parts[parts.length - 1] : displayName;
  return last.toLowerCase();
}

// ---------------------------------------------------------------------------
// Season picker
// ---------------------------------------------------------------------------

interface SeasonPickerProps {
  readonly seasons: readonly { id: number; name: string; is_active: boolean }[];
  readonly selectedId: number | 'all' | null;
  readonly onSelect: (id: number | 'all') => void;
}

function SeasonPicker({ seasons, selectedId, onSelect }: SeasonPickerProps): React.ReactNode {
  // Always render so the "All" pill remains visible and selectable, even when
  // the league has no seasons yet. Season pills simply do not appear for an
  // empty seasons array.

  const allActive = selectedId === 'all';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8 }}
    >
      <Pressable
        testID="season-pill-all"
        accessibilityRole="button"
        accessibilityState={{ selected: allActive }}
        onPress={() => {
          void hapticLight();
          onSelect('all');
        }}
        className={`px-[14px] py-[8px] rounded-full border ${
          allActive
            ? 'bg-brand-teal border-brand-teal'
            : 'bg-surface border-strong'
        } active:opacity-70`}
      >
        <AppText
          className={`text-[12px] font-semibold ${
            allActive
              ? 'text-on-brand-teal'
              : 'text-muted'
          }`}
        >
          All
        </AppText>
      </Pressable>

      {seasons.map((s) => {
        const isActive = selectedId === s.id;
        return (
          <Pressable
            key={s.id}
            testID={`season-pill-${s.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              void hapticLight();
              onSelect(s.id);
            }}
            className={`px-[14px] py-[8px] rounded-full border ${
              isActive
                ? 'bg-brand-teal border-brand-teal'
                : 'bg-surface border-strong'
            } active:opacity-70`}
          >
            <AppText
              className={`text-[12px] font-semibold ${
                isActive
                  ? 'text-on-brand-teal'
                  : 'text-muted'
              }`}
            >
              {s.name}
              {s.is_active ? ' (Active)' : ''}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Season info card
// ---------------------------------------------------------------------------

interface SeasonInfoCardProps {
  readonly info: LeagueSeasonInfo;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function endedLabel(endedAt: string | null): string {
  if (!endedAt) return 'Ends';
  return new Date(endedAt) > new Date() ? 'Ends' : 'Ended';
}

function SeasonInfoCard({ info }: SeasonInfoCardProps): React.ReactNode {
  return (
    <View
      testID="season-info-card"
      className="mx-4 mt-4 mb-2 bg-surface rounded-[12px] border border-divider p-4"
    >
      <AppText className="text-[13px] font-bold text-default mb-3">
        {info.name}
      </AppText>
      <View className="flex-row flex-wrap gap-y-2">
        <View className="w-1/2">
          <AppText className="text-[11px] text-muted uppercase tracking-wide">
            Started
          </AppText>
          <AppText className="text-[14px] font-semibold text-default">
            {formatDate(info.started_at)}
          </AppText>
        </View>
        <View className="w-1/2">
          <AppText className="text-[11px] text-muted uppercase tracking-wide">
            {endedLabel(info.ended_at)}
          </AppText>
          <AppText className="text-[14px] font-semibold text-default">
            {formatDate(info.ended_at)}
          </AppText>
        </View>
        <View className="w-1/2">
          <AppText className="text-[11px] text-muted uppercase tracking-wide">
            Sessions
          </AppText>
          <AppText className="text-[14px] font-semibold text-default">
            {info.session_count}
          </AppText>
        </View>
        <View className="w-1/2">
          <AppText className="text-[11px] text-muted uppercase tracking-wide">
            Total Games
          </AppText>
          <AppText className="text-[14px] font-semibold text-default">
            {info.game_count}
          </AppText>
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
  readonly onPressPlayer: (playerId: number) => void;
}

export default function LeagueDashboardTab({
  leagueId,
  onPressPlayer,
}: LeagueDashboardTabProps): React.ReactNode {
  const {
    standings,
    seasonInfo,
    seasons,
    selectedSeasonId,
    isLoading,
    isError,
    onSelectSeason,
  } = useLeagueDashboardTab(leagueId);

  const isSeasonView = typeof selectedSeasonId === 'number';

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (field: SortField) => {
    void hapticLight();
    if (field === sortField) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir(field === 'rank' || field === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedStandings = useMemo<readonly LeagueStanding[]>(() => {
    if (sortField == null) return standings;
    const arr = [...standings];
    arr.sort((a, b) => {
      let diff: number;
      if (sortField === 'rank') {
        diff = a.rank - b.rank;
      } else if (sortField === 'name') {
        diff = lastNameKey(a.display_name).localeCompare(lastNameKey(b.display_name));
      } else if (sortField === 'wins') {
        diff = a.wins - b.wins;
      } else if (sortField === 'win_rate') {
        diff = (a.win_rate ?? 0) - (b.win_rate ?? 0);
      } else {
        diff = (a.rating ?? 0) - (b.rating ?? 0);
      }
      return sortDir === 'asc' ? diff : -diff;
    });
    return arr;
  }, [standings, sortField, sortDir]);

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
        <AppText className="text-[16px] font-bold text-default text-center mb-2">
          Failed to load standings
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView
      testID="standings-tab"
      className="flex-1 bg-page"
      showsVerticalScrollIndicator={false}
    >
      <SeasonPicker
        seasons={seasons}
        selectedId={selectedSeasonId ?? null}
        onSelect={onSelectSeason}
      />

      <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden mb-2">
        {sortedStandings.length > 0 && (
          <LeagueStandingsTable
            standings={sortedStandings}
            isSeasonView={isSeasonView}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            onPressPlayer={onPressPlayer}
          />
        )}
        {sortedStandings.length === 0 && (
          <View className="py-10 px-6 items-center">
            <AppText className="text-[15px] font-semibold text-default text-center">
              No standings yet
            </AppText>
            <AppText className="text-[13px] text-muted text-center mt-1 leading-[18px]">
              Standings will appear after this season's first submitted game.
            </AppText>
          </View>
        )}
      </View>

      {seasonInfo != null && seasonInfo.started_at != null && (
        <SeasonInfoCard info={seasonInfo} />
      )}

      <View className="h-8" />
    </ScrollView>
  );
}
