/**
 * GameRow — a single game card in the My Games list.
 *
 * Layout (matches my-games.html .game-item):
 *   top row:  result badge (WIN/LOSS) | date/time
 *   score:    "21 - 18" large text
 *   teams:    "You / Partner vs Opp1 / Opp2" (You is bolded)
 *   meta row: league name | rating change (+/-)
 *   pending note: shown when has_pending_player is true
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { hapticMedium } from '@/utils/haptics';
import type { GameHistoryEntry } from '@/lib/mockApi';

interface GameRowProps {
  readonly game: GameHistoryEntry;
  readonly onPress?: (game: GameHistoryEntry) => void;
}

function ResultBadge({ result }: { result: 'win' | 'loss' }): React.ReactNode {
  const isWin = result === 'win';
  return (
    <View
      className={`px-2 py-[3px] rounded-[10px] ${
        isWin
          ? 'bg-green-100 dark:bg-green-900/30'
          : 'bg-red-100 dark:bg-red-900/30'
      }`}
    >
      <Text
        className={`text-[11px] font-bold ${
          isWin
            ? 'text-green-700 dark:text-green-400'
            : 'text-red-700 dark:text-red-400'
        }`}
      >
        {isWin ? 'WIN' : 'LOSS'}
      </Text>
    </View>
  );
}

function RatingChange({
  change,
}: {
  change: number | null;
}): React.ReactNode {
  if (change == null) {
    return (
      <View className="flex-row items-center gap-[3px]">
        <View className="px-2 py-[2px] rounded-[8px] bg-amber-50 dark:bg-warning-bg border border-amber-200 dark:border-amber-700">
          <Text className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
            PENDING
          </Text>
        </View>
      </View>
    );
  }
  const isUp = change >= 0;
  return (
    <Text className="text-[11px] text-text-muted dark:text-content-tertiary">
      Rating:{' '}
      <Text
        className={`font-bold ${
          isUp
            ? 'text-green-700 dark:text-green-400'
            : 'text-red-700 dark:text-red-400'
        }`}
      >
        {isUp ? '+' : ''}
        {change.toFixed(1)}
      </Text>
    </Text>
  );
}

function TeamLine({ game }: { game: GameHistoryEntry }): React.ReactNode {
  const { user_on_team1 } = game;
  const myTeam1 = user_on_team1
    ? `${game.team1_player1_name} / ${game.team1_player2_name}`
    : `${game.team1_player1_name} / ${game.team1_player2_name}`;
  const myTeam2 = user_on_team1
    ? `${game.team2_player1_name} / ${game.team2_player2_name}`
    : `${game.team2_player1_name} / ${game.team2_player2_name}`;

  // Build spans: user side has "You" bolded if user_on_team1 and player1 is "You"
  const isYouOnTeam1Side = user_on_team1 && game.team1_player1_name === 'You';
  const isYouOnTeam2Side = !user_on_team1 && game.team2_player1_name === 'You';

  if (isYouOnTeam1Side) {
    return (
      <Text className="text-[12px] text-text-muted dark:text-content-secondary leading-[1.5]">
        <Text className="font-bold text-text-default dark:text-content-primary">
          You
        </Text>
        {` / ${game.team1_player2_name} vs ${myTeam2}`}
      </Text>
    );
  }
  if (isYouOnTeam2Side) {
    return (
      <Text className="text-[12px] text-text-muted dark:text-content-secondary leading-[1.5]">
        {`${myTeam1} vs `}
        <Text className="font-bold text-text-default dark:text-content-primary">
          You
        </Text>
        {` / ${game.team2_player2_name}`}
      </Text>
    );
  }
  return (
    <Text className="text-[12px] text-text-muted dark:text-content-secondary leading-[1.5]">
      {`${myTeam1} vs ${myTeam2}`}
    </Text>
  );
}

export default function GameRow({ game, onPress }: GameRowProps): React.ReactNode {
  const handlePress = useCallback(() => {
    void hapticMedium();
    onPress?.(game);
  }, [game, onPress]);

  return (
    <Pressable
      testID={`game-row-${game.id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Game on ${game.date}: ${game.result}`}
      className="bg-white dark:bg-dark-surface rounded-[12px] px-[14px] py-[14px] shadow-sm dark:shadow-none dark:border dark:border-border-subtle mb-[10px] active:opacity-80"
    >
      {/* Top row: result badge + time */}
      <View className="flex-row justify-between items-center mb-2">
        <ResultBadge result={game.result} />
        <Text className="text-[11px] text-text-muted dark:text-content-tertiary">
          {game.time_label}
        </Text>
      </View>

      {/* Score */}
      <Text className="text-[20px] font-bold text-navy dark:text-content-primary mb-1">
        {game.team1_score} - {game.team2_score}
      </Text>

      {/* Teams */}
      <TeamLine game={game} />

      {/* Pending player note */}
      {game.has_pending_player && (
        <Text className="text-[11px] text-amber-700 dark:text-amber-400 mt-[3px]">
          Waiting for a player to claim their account
        </Text>
      )}

      {/* Meta row */}
      <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-border-subtle">
        {game.league_name != null ? (
          <Text className="text-[11px] font-bold text-accent dark:text-brand-teal">
            {game.league_name}
          </Text>
        ) : (
          <Text className="text-[11px] text-text-muted dark:text-content-tertiary">
            Pickup
          </Text>
        )}
        <RatingChange change={game.rating_change} />
      </View>
    </Pressable>
  );
}
