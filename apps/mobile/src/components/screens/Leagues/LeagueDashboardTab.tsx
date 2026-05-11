/**
 * LeagueDashboardTab — Standings tab of the League Detail screen.
 *
 * Shows:
 *   Season picker (horizontal scroll pills)
 *   Standings table: # | Player | W-L | Win% | PTS/Rating (sortable)
 *   Season Info card below the table
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
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
  if (seasons.length === 0) return null;

  const allActive = selectedId === 'all';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8 }}
    >
      <Pressable
        testID="season-pill-all"
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
        <Text
          className={`text-[12px] font-semibold ${
            allActive
              ? 'text-white'
              : 'text-muted'
          }`}
        >
          All
        </Text>
      </Pressable>

      {seasons.map((s) => {
        const isActive = selectedId === s.id;
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
                ? 'bg-brand-teal border-brand-teal'
                : 'bg-surface border-strong'
            } active:opacity-70`}
          >
            <Text
              className={`text-[12px] font-semibold ${
                isActive
                  ? 'text-white'
                  : 'text-muted'
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
  readonly isSeasonView: boolean;
  readonly onPress: (playerId: number) => void;
}

function StandingsRow({ standing, isSeasonView, onPress }: StandingsRowProps): React.ReactNode {
  const ratingDelta = standing.rating_delta;
  const ratingDisplay = standing.rating != null ? Math.round(standing.rating) : '—';
  const deltaDisplay = ratingDelta != null ? Math.round(ratingDelta) : null;

  return (
    <Pressable
      testID={`standings-row-${standing.player_id}`}
      onPress={() => {
        void hapticLight();
        onPress(standing.player_id);
      }}
      className="flex-row items-center px-4 py-[12px] border-b border-divider bg-surface active:opacity-70"
    >
      {/* Rank */}
      <Text className="w-8 text-[13px] font-bold text-muted">
        {standing.rank}
      </Text>

      {/* Avatar + Name */}
      <View className="flex-1 flex-row items-center gap-2 min-w-0">
        <View className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
          {standing.avatar_url ? (
            <Image
              source={{ uri: standing.avatar_url }}
              className="w-8 h-8"
              resizeMode="cover"
            />
          ) : (
            <View className="w-8 h-8 bg-brand-teal items-center justify-center">
              <Text className="text-[10px] font-bold text-white">{standing.initials}</Text>
            </View>
          )}
        </View>
        <Text
          className="text-[14px] font-semibold text-default"
          numberOfLines={1}
        >
          {standing.display_name}
        </Text>
      </View>

      {/* W-L */}
      <Text className="w-12 text-[13px] text-muted text-center">
        {standing.wins}-{standing.losses}
      </Text>

      {/* Win% */}
      <Text className="w-12 text-[13px] text-muted text-center">
        {standing.win_rate}%
      </Text>

      {/* PTS / Rating */}
      <View className="w-16 items-end">
        <Text className="text-[14px] font-semibold text-default">
          {ratingDisplay}
        </Text>
        {!isSeasonView && deltaDisplay != null && (
          <Text
            className={`text-[10px] font-medium ${
              deltaDisplay >= 0
                ? 'text-success'
                : 'text-danger'
            }`}
          >
            {deltaDisplay >= 0 ? '+' : ''}
            {deltaDisplay}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Standings table header (sortable)
// ---------------------------------------------------------------------------

interface StandingsHeaderProps {
  readonly isSeasonView: boolean;
  readonly sortField: SortField | null;
  readonly sortDir: SortDir;
  readonly onSort: (field: SortField) => void;
}

function SortIndicator({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField | null;
  sortDir: SortDir;
}): React.ReactNode {
  if (field !== sortField) return null;
  return (
    <Text className="text-[9px] text-default ml-[2px]">
      {sortDir === 'desc' ? '▼' : '▲'}
    </Text>
  );
}

const HEADER_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 } as const;

interface SortableHeaderProps {
  readonly testID: string;
  readonly field: SortField;
  readonly sortField: SortField | null;
  readonly sortDir: SortDir;
  readonly onSort: (field: SortField) => void;
  readonly label: string;
  readonly className: string;
  readonly textAlign?: 'left' | 'center' | 'right';
}

function SortableHeader({
  testID,
  field,
  sortField,
  sortDir,
  onSort,
  label,
  className,
  textAlign = 'left',
}: SortableHeaderProps): React.ReactNode {
  const isActive = field === sortField;
  const justify =
    textAlign === 'center'
      ? 'justify-center'
      : textAlign === 'right'
        ? 'justify-end'
        : 'justify-start';
  const textAlignClass =
    textAlign === 'center'
      ? 'text-center'
      : textAlign === 'right'
        ? 'text-right'
        : 'text-left';

  return (
    <Pressable
      testID={testID}
      onPress={() => onSort(field)}
      hitSlop={HEADER_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}`}
      accessibilityState={{ selected: isActive }}
      accessibilityHint={
        isActive
          ? `Currently sorted ${sortDir === 'desc' ? 'descending' : 'ascending'}. Tap to reverse.`
          : 'Tap to sort by this column.'
      }
      className={`${className} flex-row items-center ${justify} active:opacity-70`}
    >
      <Text
        className={`text-[12px] font-semibold ${textAlignClass} ${
          isActive
            ? 'text-default'
            : 'text-tertiary'
        }`}
      >
        {label}
      </Text>
      <SortIndicator field={field} sortField={sortField} sortDir={sortDir} />
    </Pressable>
  );
}

function StandingsHeader({ isSeasonView, sortField, sortDir, onSort }: StandingsHeaderProps): React.ReactNode {
  return (
    <View className="flex-row items-center px-4 py-[12px] bg-elevated border-b border-divider">
      <SortableHeader
        testID="sort-by-rank"
        field="rank"
        sortField={sortField}
        sortDir={sortDir}
        onSort={onSort}
        label="#"
        className="w-8"
      />
      <SortableHeader
        testID="sort-by-name"
        field="name"
        sortField={sortField}
        sortDir={sortDir}
        onSort={onSort}
        label="Player"
        className="flex-1"
      />
      <SortableHeader
        testID="sort-by-wins"
        field="wins"
        sortField={sortField}
        sortDir={sortDir}
        onSort={onSort}
        label="W-L"
        className="w-12"
        textAlign="center"
      />
      <SortableHeader
        testID="sort-by-win-rate"
        field="win_rate"
        sortField={sortField}
        sortDir={sortDir}
        onSort={onSort}
        label="Win%"
        className="w-12"
        textAlign="center"
      />
      <SortableHeader
        testID="sort-by-rating"
        field="rating"
        sortField={sortField}
        sortDir={sortDir}
        onSort={onSort}
        label={isSeasonView ? 'PTS' : 'Rating'}
        className="w-16"
        textAlign="right"
      />
    </View>
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
      <Text className="text-[13px] font-bold text-default mb-3">
        {info.name}
      </Text>
      <View className="flex-row flex-wrap gap-y-2">
        <View className="w-1/2">
          <Text className="text-[11px] text-muted uppercase tracking-wide">
            Started
          </Text>
          <Text className="text-[14px] font-semibold text-default">
            {formatDate(info.started_at)}
          </Text>
        </View>
        <View className="w-1/2">
          <Text className="text-[11px] text-muted uppercase tracking-wide">
            {endedLabel(info.ended_at)}
          </Text>
          <Text className="text-[14px] font-semibold text-default">
            {formatDate(info.ended_at)}
          </Text>
        </View>
        <View className="w-1/2">
          <Text className="text-[11px] text-muted uppercase tracking-wide">
            Sessions
          </Text>
          <Text className="text-[14px] font-semibold text-default">
            {info.session_count}
          </Text>
        </View>
        <View className="w-1/2">
          <Text className="text-[11px] text-muted uppercase tracking-wide">
            Total Games
          </Text>
          <Text className="text-[14px] font-semibold text-default">
            {info.game_count}
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
        <Text className="text-[16px] font-bold text-default text-center mb-2">
          Failed to load standings
        </Text>
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
        <StandingsHeader
          isSeasonView={isSeasonView}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
        {sortedStandings.map((s) => (
          <StandingsRow key={s.player_id} standing={s} isSeasonView={isSeasonView} onPress={onPressPlayer} />
        ))}
        {sortedStandings.length === 0 && (
          <View className="py-10 items-center">
            <Text className="text-[14px] text-muted">
              No standings yet
            </Text>
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
