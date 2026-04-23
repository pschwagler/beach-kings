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
import type { LeaguePlayerStats, GameHistoryEntry } from '@/lib/mockApi';

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
                ? 'bg-[#1a3a4a] dark:bg-brand-teal border-[#1a3a4a] dark:border-brand-teal'
                : 'bg-white dark:bg-dark-surface border-[#ddd] dark:border-border-strong'
            } active:opacity-70`}
          >
            <Text
              className={`text-[11px] font-semibold ${
                isActive ? 'text-white' : 'text-text-secondary dark:text-content-secondary'
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
    <View className="flex-1 items-center bg-white dark:bg-dark-surface rounded-[12px] border border-[#e8e8e8] dark:border-border-subtle py-3 px-2">
      <Text className="text-[11px] text-text-secondary dark:text-content-secondary uppercase tracking-wide mb-1">
        {label}
      </Text>
      <Text className="text-[20px] font-extrabold text-text-default dark:text-content-primary">
        {value}
      </Text>
      {delta != null && (
        <Text
          className={`text-[11px] font-medium ${
            delta >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-500 dark:text-red-400'
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
    <View className="mx-4 mb-4 bg-white dark:bg-dark-surface rounded-[12px] border border-[#e8e8e8] dark:border-border-subtle overflow-hidden">
      <View className="px-4 py-[10px] border-b border-[#f0f0f0] dark:border-border-subtle">
        <Text className="text-[13px] font-bold text-text-default dark:text-content-primary">
          {title}
        </Text>
      </View>
      {/* Header */}
      <View className="flex-row px-4 py-[6px] bg-[#f8f8f8] dark:bg-dark-elevated">
        <Text className="flex-1 text-[10px] font-bold text-text-secondary dark:text-content-tertiary uppercase">
          Player
        </Text>
        <Text className="w-10 text-[10px] font-bold text-text-secondary dark:text-content-tertiary uppercase text-center">GP</Text>
        <Text className="w-10 text-[10px] font-bold text-text-secondary dark:text-content-tertiary uppercase text-center">W-L</Text>
        <Text className="w-12 text-[10px] font-bold text-text-secondary dark:text-content-tertiary uppercase text-right">Win%</Text>
      </View>
      {rows.map((row) => (
        <View
          key={row.player_id}
          className="flex-row items-center px-4 py-[10px] border-t border-[#f0f0f0] dark:border-border-subtle"
        >
          <View className="flex-1 flex-row items-center gap-2">
            <View className="w-7 h-7 rounded-full bg-[#ddd] dark:bg-dark-elevated items-center justify-center">
              <Text className="text-[9px] font-bold text-[#666] dark:text-content-secondary">
                {row.initials}
              </Text>
            </View>
            <Text className="text-[13px] font-semibold text-text-default dark:text-content-primary" numberOfLines={1}>
              {row.display_name}
            </Text>
          </View>
          <Text className="w-10 text-[12px] text-text-secondary dark:text-content-secondary text-center">
            {row.games_played}
          </Text>
          <Text className="w-10 text-[12px] text-text-secondary dark:text-content-secondary text-center">
            {row.wins}-{row.losses}
          </Text>
          <Text className="w-12 text-[12px] font-semibold text-text-default dark:text-content-primary text-right">
            {row.win_rate}%
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
  const isWin = game.result === 'win';
  const dateLabel = new Date(game.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <View
      testID={`stats-game-${game.id}`}
      className="flex-row items-center px-4 py-[10px] border-b border-[#f0f0f0] dark:border-border-subtle"
    >
      <View className="flex-1 min-w-0">
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
          {dateLabel}
        </Text>
        <Text className="text-[13px] font-semibold text-text-default dark:text-content-primary" numberOfLines={1}>
          {game.team1_player1_name}/{game.team1_player2_name} vs {game.team2_player1_name}/{game.team2_player2_name}
        </Text>
      </View>
      <Text className="text-[14px] font-bold text-text-default dark:text-content-primary mx-3">
        {game.team1_score}–{game.team2_score}
      </Text>
      <View
        className={`rounded-[6px] px-2 py-[3px] ${
          isWin ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
        }`}
      >
        <Text
          className={`text-[11px] font-bold ${
            isWin ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {isWin ? 'W' : 'L'}
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
    <View className="flex-row bg-[#f0f0f0] dark:bg-dark-elevated rounded-[8px] mx-4 mb-4 p-[3px]">
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
              isActive ? 'bg-white dark:bg-dark-surface' : ''
            } active:opacity-70`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive
                  ? 'text-text-default dark:text-content-primary'
                  : 'text-text-secondary dark:text-content-secondary'
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
      <View className="mx-4 mb-4 bg-white dark:bg-dark-surface rounded-[12px] border border-[#e8e8e8] dark:border-border-subtle overflow-hidden">
        <View className="px-4 py-[10px] border-b border-[#f0f0f0] dark:border-border-subtle">
          <Text className="text-[13px] font-bold text-text-default dark:text-content-primary">
            Overall
          </Text>
        </View>
        <View className="flex-row flex-wrap px-4 py-3 gap-y-2">
          {[
            { label: 'Wins', value: String(stats.overall.wins) },
            { label: 'Losses', value: String(stats.overall.losses) },
            { label: 'Win%', value: `${stats.overall.win_rate}%` },
            { label: 'GP', value: String(stats.overall.games_played) },
            { label: '+/-', value: stats.overall.point_diff > 0 ? `+${stats.overall.point_diff.toFixed(1)}` : String(stats.overall.point_diff.toFixed(1)) },
          ].map(({ label, value }) => (
            <View key={label} className="w-1/3 items-center py-1">
              <Text className="text-[11px] text-text-secondary dark:text-content-secondary uppercase tracking-wide mb-[2px]">
                {label}
              </Text>
              <Text className="text-[16px] font-bold text-text-default dark:text-content-primary">
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
        <Text className="text-[16px] font-bold text-text-default dark:text-content-primary text-center">
          Failed to load stats
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="player-stats-tab"
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Player hero */}
      <View className="bg-white dark:bg-dark-surface px-4 py-5 border-b border-[#f0f0f0] dark:border-border-subtle mb-4">
        <View className="items-center mb-3">
          <View className="w-16 h-16 rounded-full bg-[#1a3a4a] dark:bg-brand-teal/30 items-center justify-center mb-2">
            <Text className="text-[20px] font-bold text-white dark:text-brand-teal">
              {stats.initials}
            </Text>
          </View>
          <Text className="text-[18px] font-bold text-text-default dark:text-content-primary">
            {stats.display_name}
          </Text>
          {stats.level != null && (
            <View className="bg-[#e8f4f8] dark:bg-teal-900/40 rounded-[6px] px-3 py-[2px] mt-1">
              <Text className="text-[11px] font-bold text-[#2a7d9c] dark:text-teal-300">
                {stats.level}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Context banner */}
      <View className="bg-[#1a3a4a] dark:bg-brand-teal/20 px-4 py-2 mb-2">
        <Text className="text-[12px] font-semibold text-white dark:text-brand-teal">
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
          className="mx-4 bg-white dark:bg-dark-surface rounded-[12px] border border-[#e8e8e8] dark:border-border-subtle overflow-hidden"
        >
          {stats.game_history.length === 0 ? (
            <View className="py-10 items-center">
              <Text className="text-[14px] text-text-muted dark:text-content-tertiary">
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
