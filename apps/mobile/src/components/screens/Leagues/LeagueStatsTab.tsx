/**
 * LeagueStatsTab — Player Stats sub-view for the League Detail screen.
 *
 * Accessed by tapping a player row in the Standings tab. Shows:
 *   Player hero (avatar, name, level, location)
 *   League context banner with season picker
 *   Overview tiles: Ranking, Points, Rating (+delta)
 *   Inner segment: Stats | Game History
 *   Stats view: Overall W/L, Partners, Opponents breakdown
 *   Game History: recent match cards
 *
 * Wireframe ref: league-player-stats.html
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { hapticLight } from '@/utils/haptics';
import { formatElo, formatGameScore } from '@/lib/formatters';
import Avatar from '@/components/ui/Avatar';
import {
  useLeagueStatsTab,
  type StatsInnerTab,
} from './useLeagueStatsTab';
import type { GameHistoryEntry, LeaguePlayerStats } from '@beach-kings/shared';
import FilterChipBar from '@/components/ui/FilterChipBar';
import TabView from '@/components/ui/TabView';

// Backend returns win_rate as a 0–1 float; render as a 0–100 percentage.
function formatWinRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Season selector
// ---------------------------------------------------------------------------

interface SeasonSelectorProps {
  readonly seasons: readonly { id: number; name: string }[];
  readonly selectedId: number | null;
  readonly onSelect: (id: number) => void;
}

function SeasonSelector({ seasons, selectedId, onSelect }: SeasonSelectorProps): React.ReactNode {
  if (seasons.length <= 1) return null;
  const value = String(selectedId ?? seasons[0]?.id);
  return <FilterChipBar
    items={seasons.map((season) => ({
      value: String(season.id),
      label: season.name,
      testID: `stats-season-${season.id}`,
    }))}
    value={value}
    onValueChange={(nextValue) => {
      void hapticLight();
      onSelect(Number(nextValue));
    }}
    accessibilityLabel="Stats season filters"
    contentClassName="py-2"
  />;
}

// ---------------------------------------------------------------------------
// Overview tiles
// ---------------------------------------------------------------------------

function OverviewTile({
  label,
  value,
  delta,
}: {
  readonly label: string;
  readonly value: string;
  readonly delta?: number | null;
}): React.ReactNode {
  return (
    <View className="flex-1 items-center bg-surface rounded-[12px] border border-divider py-3 px-2">
      <AppText className="text-[11px] text-muted uppercase tracking-wide mb-1">
        {label}
      </AppText>
      <AppText className="text-[20px] font-bold text-default">
        {value}
      </AppText>
      {delta != null && (
        <AppText
          className={`text-[11px] font-medium ${
            delta >= 0
              ? 'text-success'
              : 'text-danger'
          }`}
        >
          {delta >= 0 ? '+' : ''}{delta}
        </AppText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Breakdown table (partners / opponents)
// ---------------------------------------------------------------------------

interface BreakdownRow {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly avatar_url?: string | null;
  readonly games_played: number;
  readonly wins: number;
  readonly losses: number;
  readonly win_rate: number;
}

function BreakdownTable({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly BreakdownRow[];
}): React.ReactNode {
  if (rows.length === 0) return null;

  return (
    <View className="mx-4 mb-4 bg-surface rounded-[12px] border border-divider overflow-hidden">
      <View className="px-4 py-[10px] border-b border-divider">
        <AppText className="text-[13px] font-bold text-default">
          {title}
        </AppText>
      </View>
      {/* Header */}
      <View className="flex-row px-4 py-[6px] bg-elevated">
        <AppText className="flex-1 text-[10px] font-bold text-tertiary uppercase">
          Player
        </AppText>
        <AppText className="w-10 text-[10px] font-bold text-tertiary uppercase text-center">GP</AppText>
        <AppText className="w-10 text-[10px] font-bold text-tertiary uppercase text-center">W-L</AppText>
        <AppText className="w-12 text-[10px] font-bold text-tertiary uppercase text-right">Win%</AppText>
      </View>
      {rows.map((row) => (
        <View
          key={row.player_id}
          className="flex-row items-center px-4 py-[10px] border-t border-divider"
        >
          <View className="flex-1 flex-row items-center gap-2">
            <Avatar
              imageUrl={row.avatar_url}
              name={row.display_name}
              size={28}
              colorSeed={row.player_id}
              accessible={false}
            />
            <AppText className="text-[13px] font-semibold text-default" numberOfLines={1}>
              {row.display_name}
            </AppText>
          </View>
          <AppText className="w-10 text-[12px] text-muted text-center">
            {row.games_played}
          </AppText>
          <AppText className="w-10 text-[12px] text-muted text-center">
            {row.wins}-{row.losses}
          </AppText>
          <AppText className="w-12 text-[12px] font-semibold text-default text-right">
            {formatWinRate(row.win_rate)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Game history card
// ---------------------------------------------------------------------------

/**
 * Derives the display label for the viewed player's team slot in a game card.
 *
 * - Own profile (is_self=true): always "You"
 * - Other player (is_self=false): first token of display_name (e.g. "Alex Torres" → "Alex");
 *   falls back to full display_name when it is a single token, and to "Player" when empty.
 */
function deriveSelfLabel(isSelf: boolean, displayName: string): string {
  if (isSelf) return 'You';
  if (!displayName) return 'Player';
  const spaceIndex = displayName.indexOf(' ');
  return spaceIndex > 0 ? displayName.slice(0, spaceIndex) : displayName;
}

interface GameHistoryCardProps {
  readonly game: GameHistoryEntry;
  /** Label to use for the viewed player's team slot (e.g. "You" or "Alex"). */
  readonly selfLabel: string;
}

function GameHistoryCard({ game, selfLabel }: GameHistoryCardProps): React.ReactNode {
  const isWin = game.result === 'W';
  const isDraw = game.result === 'D';

  const myTeam = game.partner_names.length > 0
    ? `${selfLabel} / ${game.partner_names.join(' / ')}`
    : selfLabel;
  const oppTeam = game.opponent_names.join(' / ');

  return (
    <View
      testID={`stats-game-${game.id}`}
      className="flex-row items-center px-4 py-[10px] border-b border-divider"
    >
      <View className="flex-1 min-w-0">
        <AppText className="text-[13px] font-semibold text-default" numberOfLines={1}>
          {myTeam} vs {oppTeam}
        </AppText>
      </View>
      <AppText className="text-[14px] font-bold text-default mx-3">
        {formatGameScore(game.my_score, game.opponent_score)}
      </AppText>
      <View
        className={`rounded-[6px] px-2 py-[3px] ${
          isWin
            ? 'bg-success-tint'
            : isDraw
              ? 'bg-elevated'
              : 'bg-danger-tint'
        }`}
      >
        <AppText
          className={`text-[11px] font-bold ${
            isWin
              ? 'text-success'
              : isDraw
                ? 'text-muted'
                : 'text-danger'
          }`}
        >
          {game.result}
        </AppText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inner tab bar
// ---------------------------------------------------------------------------

interface InnerTabBarProps {
  readonly active: StatsInnerTab;
  readonly onSelect: (t: StatsInnerTab) => void;
}

function InnerTabBar({ active, onSelect }: InnerTabBarProps): React.ReactNode {
  return <TabView
    items={[
      { value: 'stats', label: 'Stats', testID: 'stats-inner-tab-stats' },
      { value: 'history', label: 'Game History', testID: 'stats-inner-tab-history' },
    ]}
    value={active}
    onValueChange={(tab) => {
      void hapticLight();
      onSelect(tab);
    }}
    className="mb-4"
  />;
}

// ---------------------------------------------------------------------------
// Stats content
// ---------------------------------------------------------------------------

function StatsContent({ stats }: { readonly stats: LeaguePlayerStats }): React.ReactNode {
  return (
    <>
      {/* Overall stats */}
      <View className="mx-4 mb-4 bg-surface rounded-[12px] border border-divider overflow-hidden">
        <View className="px-4 py-[10px] border-b border-divider">
          <AppText className="text-[13px] font-bold text-default">
            Overall
          </AppText>
        </View>
        <View className="flex-row flex-wrap px-4 py-3 gap-y-2">
          {[
            { label: 'Wins', value: String(stats.overall.wins) },
            { label: 'Losses', value: String(stats.overall.losses) },
            { label: 'Win%', value: formatWinRate(stats.overall.win_rate) },
            { label: 'GP', value: String(stats.overall.games_played) },
            { label: '+/-', value: stats.overall.point_diff > 0 ? `+${stats.overall.point_diff.toFixed(1)}` : String(stats.overall.point_diff.toFixed(1)) },
          ].map(({ label, value }) => (
            <View key={label} className="w-1/3 items-center py-1">
              <AppText className="text-[11px] text-muted uppercase tracking-wide mb-[2px]">
                {label}
              </AppText>
              <AppText className="text-[16px] font-bold text-default">
                {value}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <BreakdownTable title="With Partners" rows={stats.partners} />
      <BreakdownTable title="Vs Opponents" rows={stats.opponents} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LeagueStatsTabProps {
  readonly leagueId: number | string;
  readonly playerId: number | string;
}

export default function LeagueStatsTab({
  leagueId,
  playerId,
}: LeagueStatsTabProps): React.ReactNode {
  const {
    stats,
    isLoading,
    isError,
    innerTab,
    selectedSeasonId,
    availableSeasons,
    onSelectSeason,
    onSetInnerTab,
  } = useLeagueStatsTab(leagueId, playerId);

  if (isLoading) {
    return (
      <View testID="player-stats-loading" className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || stats == null) {
    return (
      <View
        testID="player-stats-error"
        className="flex-1 items-center justify-center px-8"
      >
        <AppText className="text-[16px] font-bold text-default text-center">
          Failed to load stats
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView
      testID="player-stats-tab"
      className="flex-1 bg-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Player hero */}
      <View className="bg-surface px-4 py-5 border-b border-divider mb-4">
        <View className="items-center mb-3">
          <Avatar
            imageUrl={stats.avatar_url}
            name={stats.display_name}
            size={64}
            colorSeed={stats.player_id}
            className="mb-2"
            accessible={false}
          />
          <AppText className="text-[18px] font-bold text-default">
            {stats.display_name}
          </AppText>
          {stats.level != null && (
            <View className="bg-info-tint rounded-[6px] px-3 py-[2px] mt-1">
              <AppText className="text-[11px] font-bold text-info">
                {stats.level}
              </AppText>
            </View>
          )}
        </View>
      </View>

      {/* Context banner — season_name is null for all-time stats */}
      <View className="bg-info-tint px-4 py-2 mb-2">
        <AppText className="text-[12px] font-semibold text-info">
          {stats.season_name != null
            ? `${stats.league_name} · ${stats.season_name}`
            : `${stats.league_name} · All-time`}
        </AppText>
      </View>

      <SeasonSelector
        seasons={availableSeasons}
        selectedId={selectedSeasonId}
        onSelect={onSelectSeason}
      />

      {/* Overview tiles */}
      <View className="flex-row gap-2 px-4 mb-4">
        <OverviewTile
          label="Rank"
          value={stats.rank != null ? `#${stats.rank}` : '—'}
        />
        <OverviewTile
          label="Rating"
          value={formatElo(stats.rating)}
          delta={stats.rating_delta}
        />
        <OverviewTile
          label="GP"
          value={String(stats.overall.games_played)}
        />
      </View>

      {/* Inner tab bar */}
      <InnerTabBar active={innerTab} onSelect={onSetInnerTab} />

      {/* Content */}
      {innerTab === 'stats' ? (
        <StatsContent stats={stats} />
      ) : (
        <View
          testID="game-history-list"
          className="mx-4 bg-surface rounded-[12px] border border-divider overflow-hidden"
        >
          {stats.game_history.length === 0 ? (
            <View className="py-10 items-center">
              <AppText className="text-[14px] text-muted">
                No games yet
              </AppText>
            </View>
          ) : (
            stats.game_history.map((g) => (
              <GameHistoryCard
                key={g.id}
                game={g}
                selfLabel={deriveSelfLabel(stats.is_self, stats.display_name)}
              />
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}
