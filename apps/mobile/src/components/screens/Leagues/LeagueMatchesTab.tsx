/**
 * LeagueMatchesTab — Games tab of the League Detail screen.
 *
 * Shows session cards with game rows, score pairs, W/L badges,
 * and per-session stat footer.
 *
 * Wireframe ref: league-matches.html
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLeagueMatchesTab, type SessionGroup } from './useLeagueMatchesTab';
import type { GameHistoryEntry } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Game row
// ---------------------------------------------------------------------------

function GameRow({ game }: { readonly game: GameHistoryEntry }): React.ReactNode {
  const isWin = game.result === 'W';
  const isDraw = game.result === 'D';

  const myTeam = game.partner_names.length > 0
    ? `You / ${game.partner_names.join(' / ')}`
    : 'You';
  const oppTeam = game.opponent_names.join(' / ');

  return (
    <View
      testID={`game-row-${game.id}`}
      className="px-4 py-[10px] border-b border-[#f0f0f0] dark:border-border-subtle"
    >
      <View className="flex-row items-center">
        {/* Teams */}
        <View className="flex-1 min-w-0">
          <Text
            className="text-[13px] font-semibold text-text-default dark:text-content-primary"
            numberOfLines={1}
          >
            {myTeam}
          </Text>
          <Text
            className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]"
            numberOfLines={1}
          >
            vs {oppTeam}
          </Text>
        </View>

        {/* Score */}
        <View className="flex-row items-center gap-2 mr-2">
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary">
            {game.my_score} – {game.opponent_score}
          </Text>
        </View>

        {/* W/L/D badge */}
        <View
          className={`rounded-[6px] px-[8px] py-[3px] ${
            isWin
              ? 'bg-green-100 dark:bg-green-900/30'
              : isDraw
                ? 'bg-gray-100 dark:bg-gray-800/40'
                : 'bg-red-100 dark:bg-red-900/30'
          }`}
        >
          <Text
            className={`text-[11px] font-bold ${
              isWin
                ? 'text-green-700 dark:text-green-400'
                : isDraw
                  ? 'text-gray-600 dark:text-gray-400'
                  : 'text-red-600 dark:text-red-400'
            }`}
          >
            {game.result}
          </Text>
        </View>
      </View>

      {/* Rating change */}
      {game.rating_change != null && (
        <Text
          className={`text-[11px] mt-[2px] ${
            game.rating_change >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-500 dark:text-red-400'
          }`}
        >
          {game.rating_change >= 0 ? '+' : ''}
          {game.rating_change} pts
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

function SessionCard({ session }: { readonly session: SessionGroup }): React.ReactNode {
  const totalRating = Math.round(session.ratingChange * 10) / 10;

  return (
    <View
      testID={`session-card-${session.session_id}`}
      className="bg-white dark:bg-dark-surface rounded-[12px] mx-4 mb-3 border border-[#e8e8e8] dark:border-border-subtle overflow-hidden"
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-[12px] bg-[#f8f8f8] dark:bg-dark-elevated border-b border-[#e8e8e8] dark:border-border-subtle">
        <View className="flex-1">
          <Text className="text-[13px] font-bold text-text-default dark:text-content-primary">
            Session #{session.session_number ?? session.session_id}
          </Text>
        </View>
        <View className="bg-blue-100 dark:bg-blue-900/30 rounded-[8px] px-2 py-[2px]">
          <Text className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
            Completed
          </Text>
        </View>
      </View>

      {/* Game rows */}
      {session.games.map((g) => (
        <GameRow key={g.id} game={g} />
      ))}

      {/* Footer stats */}
      <View className="flex-row px-4 py-[10px] gap-4 border-t border-[#f0f0f0] dark:border-border-subtle">
        <View>
          <Text className="text-[10px] text-text-secondary dark:text-content-tertiary uppercase tracking-wide">
            Games
          </Text>
          <Text className="text-[14px] font-bold text-text-default dark:text-content-primary">
            {session.games.length}
          </Text>
        </View>
        <View>
          <Text className="text-[10px] text-text-secondary dark:text-content-tertiary uppercase tracking-wide">
            Your W-L
          </Text>
          <Text className="text-[14px] font-bold text-text-default dark:text-content-primary">
            {session.userWins}-{session.userLosses}
          </Text>
        </View>
        <View>
          <Text className="text-[10px] text-text-secondary dark:text-content-tertiary uppercase tracking-wide">
            Rating
          </Text>
          <Text
            className={`text-[14px] font-bold ${
              totalRating >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-500 dark:text-red-400'
            }`}
          >
            {totalRating >= 0 ? '+' : ''}
            {totalRating}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface LeagueMatchesTabProps {
  readonly leagueId: number | string;
}

export default function LeagueMatchesTab({ leagueId }: LeagueMatchesTabProps): React.ReactNode {
  const { sessions, isLoading, isError } = useLeagueMatchesTab(leagueId);

  if (isLoading) {
    return (
      <View testID="matches-loading" className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        testID="matches-error"
        className="flex-1 items-center justify-center px-8"
      >
        <Text className="text-[16px] font-bold text-text-default dark:text-content-primary text-center">
          Failed to load games
        </Text>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View
        testID="matches-empty"
        className="flex-1 items-center justify-center px-8 py-16"
      >
        <Text className="text-[18px] font-bold text-text-default dark:text-content-primary mb-2 text-center">
          No Games Yet
        </Text>
        <Text className="text-[14px] text-text-muted dark:text-content-tertiary text-center">
          Games will appear here after sessions are submitted.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="matches-tab"
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {sessions.map((s) => (
        <SessionCard key={s.session_id} session={s} />
      ))}
    </ScrollView>
  );
}
