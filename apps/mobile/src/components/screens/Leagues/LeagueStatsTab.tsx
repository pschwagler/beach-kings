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
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { hapticLight } from '@/utils/haptics';
import {
  useLeagueStatsTab,
  type StatsInnerTab,
} from './useLeagueStatsTab';
import type { GameHistoryEntry, LeaguePlayerStats } from '@beach-kings/shared';

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

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
    >
      {seasons.map((s) => {
        const isActive = selectedId === s.id || (selectedId === null && seasons[0]?.id === s.id);
        return (
          <Pressable
            key={s.id}
            testID={`stats-season-${s.id}`}
            onPress={() => {
              void hapticLight();
              onSelect(s.id);
            }}
            className={`px-3 py-[6px] rounded-full border text-xs ${
              isActive
                ? 'bg-brand-teal border-brand-teal'
                : 'bg-surface border-strong'
            } active:opacity-70`}
          >
            <Text
              className={`text-[11px] font-semibold ${
                isActive ? 'text-white' : 'text-muted'
              }`}
            >
              {s.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
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
      <Text className="text-[11px] text-muted uppercase tracking-wide mb-1">
        {label}
      </Text>
      <Text className="text-[20px] font-extrabold text-default">
        {value}
      </Text>
      {delta != null && (
        <Text
          className={`text-[11px] font-medium ${
            delta >= 0
              ? 'text-success'
              : 'text-danger'
          }`}
        >
          {delta >= 0 ? '+' : ''}{delta}
        </Text>
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
        <Text className="text-[13px] font-bold text-default">
          {title}
        </Text>
      </View>
      {/* Header */}
      <View className="flex-row px-4 py-[6px] bg-elevated">
        <Text className="flex-1 text-[10px] font-bold text-tertiary uppercase">
          Player
        </Text>
        <Text className="w-10 text-[10px] font-bold text-tertiary uppercase text-center">GP</Text>
        <Text className="w-10 text-[10px] font-bold text-tertiary uppercase text-center">W-L</Text>
        <Text className="w-12 text-[10px] font-bold text-tertiary uppercase text-right">Win%</Text>
      </View>
      {rows.map((row) => (
        <View
          key={row.player_id}
          className="flex-row items-center px-4 py-[10px] border-t border-divider"
        >
          <View className="flex-1 flex-row items-center gap-2">
            <View className="w-7 h-7 rounded-full bg-elevated items-center justify-center">
              <Text className="text-[9px] font-bold text-muted">
                {row.initials}
              </Text>
            </View>
            <Text className="text-[13px] font-semibold text-default" numberOfLines={1}>
              {row.display_name}
            </Text>
          </View>
          <Text className="w-10 text-[12px] text-muted text-center">
            {row.games_played}
          </Text>
          <Text className="w-10 text-[12px] text-muted text-center">
            {row.wins}-{row.losses}
          </Text>
          <Text className="w-12 text-[12px] font-semibold text-default text-right">
            {formatWinRate(row.win_rate)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Game history card
// ---------------------------------------------------------------------------

function GameHistoryCard({ game }: { readonly game: GameHistoryEntry }): React.ReactNode {
  const isWin = game.result === 'W';
  const isDraw = game.result === 'D';

  const myTeam = game.partner_names.length > 0
    ? `You / ${game.partner_names.join(' / ')}`
    : 'You';
  const oppTeam = game.opponent_names.join(' / ');

  return (
    <View
      testID={`stats-game-${game.id}`}
      className="flex-row items-center px-4 py-[10px] border-b border-divider"
    >
      <View className="flex-1 min-w-0">
        <Text className="text-[13px] font-semibold text-default" numberOfLines={1}>
          {myTeam} vs {oppTeam}
        </Text>
      </View>
      <Text className="text-[14px] font-bold text-default mx-3">
        {game.my_score}–{game.opponent_score}
      </Text>
      <View
        className={`rounded-[6px] px-2 py-[3px] ${
          isWin
            ? 'bg-success-tint'
            : isDraw
              ? 'bg-elevated'
              : 'bg-danger-tint'
        }`}
      >
        <Text
          className={`text-[11px] font-bold ${
            isWin
              ? 'text-success'
              : isDraw
                ? 'text-muted'
                : 'text-danger'
          }`}
        >
          {game.result}
        </Text>
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
  return (
    <View className="flex-row bg-elevated rounded-[8px] mx-4 mb-4 p-[3px]">
      {(['stats', 'history'] as const).map((tab) => {
        const isActive = active === tab;
        const label = tab === 'stats' ? 'Stats' : 'Game History';
        return (
          <Pressable
            key={tab}
            testID={`stats-inner-tab-${tab}`}
            onPress={() => {
              void hapticLight();
              onSelect(tab);
            }}
            className={`flex-1 py-[8px] rounded-[6px] items-center ${
              isActive ? 'bg-surface' : ''
            } active:opacity-70`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive
                  ? 'text-default'
                  : 'text-muted'
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
          <Text className="text-[13px] font-bold text-default">
            Overall
          </Text>
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
              <Text className="text-[11px] text-muted uppercase tracking-wide mb-[2px]">
                {label}
              </Text>
              <Text className="text-[16px] font-bold text-default">
                {value}
              </Text>
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
        <Text className="text-[16px] font-bold text-default text-center">
          Failed to load stats
        </Text>
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
          <View className="w-16 h-16 rounded-full bg-brand-teal/30 items-center justify-center mb-2">
            <Text className="text-[20px] font-bold text-white">
              {stats.initials}
            </Text>
          </View>
          <Text className="text-[18px] font-bold text-default">
            {stats.display_name}
          </Text>
          {stats.level != null && (
            <View className="bg-info-tint rounded-[6px] px-3 py-[2px] mt-1">
              <Text className="text-[11px] font-bold text-info">
                {stats.level}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Context banner */}
      <View className="bg-brand-teal/20 px-4 py-2 mb-2">
        <Text className="text-[12px] font-semibold text-white">
          {stats.league_name} · {stats.season_name}
        </Text>
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
          value={String(stats.rating)}
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
              <Text className="text-[14px] text-muted">
                No games yet
              </Text>
            </View>
          ) : (
            stats.game_history.map((g) => (
              <GameHistoryCard key={g.id} game={g} />
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}
