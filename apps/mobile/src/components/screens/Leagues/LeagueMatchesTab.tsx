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
      className="px-4 py-[10px] border-b border-divider"
    >
      <View className="flex-row items-center">
        {/* Teams */}
        <View className="flex-1 min-w-0">
          <Text
            className="text-[13px] font-semibold text-default"
            numberOfLines={1}
          >
            {myTeam}
          </Text>
          <Text
            className="text-[12px] text-muted mt-[2px]"
            numberOfLines={1}
          >
            vs {oppTeam}
          </Text>
        </View>

        {/* Score */}
        <View className="flex-row items-center gap-2 mr-2">
          <Text className="text-[15px] font-bold text-default">
            {game.my_score} – {game.opponent_score}
          </Text>
        </View>

        {/* W/L/D badge */}
        <View
          className={`rounded-[6px] px-[8px] py-[3px] ${
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

      {/* Rating change */}
      {game.rating_change != null && (
        <Text
          className={`text-[11px] mt-[2px] ${
            game.rating_change >= 0
              ? 'text-success'
              : 'text-danger'
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
      className="bg-surface rounded-[12px] mx-4 mb-3 border border-divider overflow-hidden"
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-[12px] bg-elevated border-b border-divider">
        <View className="flex-1">
          <Text className="text-[13px] font-bold text-default">
            Session #{session.session_number ?? session.session_id}
          </Text>
        </View>
        <View className="bg-info-tint rounded-[8px] px-2 py-[2px]">
          <Text className="text-[11px] font-semibold text-info">
            Completed
          </Text>
        </View>
      </View>

      {/* Game rows */}
      {session.games.map((g) => (
        <GameRow key={g.id} game={g} />
      ))}

      {/* Footer stats */}
      <View className="flex-row px-4 py-[10px] gap-4 border-t border-divider">
        <View>
          <Text className="text-[10px] text-tertiary uppercase tracking-wide">
            Games
          </Text>
          <Text className="text-[14px] font-bold text-default">
            {session.games.length}
          </Text>
        </View>
        <View>
          <Text className="text-[10px] text-tertiary uppercase tracking-wide">
            Your W-L
          </Text>
          <Text className="text-[14px] font-bold text-default">
            {session.userWins}-{session.userLosses}
          </Text>
        </View>
        <View>
          <Text className="text-[10px] text-tertiary uppercase tracking-wide">
            Rating
          </Text>
          <Text
            className={`text-[14px] font-bold ${
              totalRating >= 0
                ? 'text-success'
                : 'text-danger'
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
        <Text className="text-[16px] font-bold text-default text-center">
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
        <Text className="text-[18px] font-bold text-default mb-2 text-center">
          No Games Yet
        </Text>
        <Text className="text-[14px] text-muted text-center">
          Games will appear here after sessions are submitted.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="matches-tab"
      className="flex-1 bg-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {sessions.map((s) => (
        <SessionCard key={s.session_id} session={s} />
      ))}
    </ScrollView>
  );
}
