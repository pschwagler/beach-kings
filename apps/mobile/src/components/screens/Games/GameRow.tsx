/**
 * GameRow — a single game card in the My Games list.
 *
 * Layout (matches my-games.html .game-item):
 *   top row:  result badge (WIN/LOSS/DRAW)
 *   score:    "21-18" large text
 *   teams:    "You / Partner vs Opp1 / Opp2" (You is bolded)
 *   meta row: league name | rating change (+/-)
 *   pending note: shown when session not yet submitted
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { hapticMedium } from '@/utils/haptics';
import { formatGameScore } from '@/lib/formatters';
import type { GameHistoryEntry } from '@beach-kings/shared';

interface GameRowProps {
  readonly game: GameHistoryEntry;
  readonly onPress?: (game: GameHistoryEntry) => void;
}

function ResultBadge({ result }: { result: 'W' | 'L' | 'D' }): React.ReactNode {
  const isWin = result === 'W';
  const isDraw = result === 'D';
  const bgClass = isWin
    ? 'bg-success-tint'
    : isDraw
      ? 'bg-elevated'
      : 'bg-danger-tint';
  const textClass = isWin
    ? 'text-success'
    : isDraw
      ? 'text-muted'
      : 'text-danger';
  const label = isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS';

  return (
    <View className={`px-2 py-[3px] rounded-[10px] ${bgClass}`}>
      <Text className={`text-[11px] font-bold ${textClass}`}>{label}</Text>
    </View>
  );
}

function RatingChange({
  change,
  submitted,
}: {
  change: number | null;
  submitted: boolean;
}): React.ReactNode {
  if (!submitted || change == null) {
    return (
      <View className="flex-row items-center gap-[3px]">
        <View className="px-2 py-[2px] rounded-[8px] bg-warning-tint border border-warning-tint">
          <Text className="text-[10px] font-bold text-warning">
            PENDING
          </Text>
        </View>
      </View>
    );
  }
  const isUp = change >= 0;
  return (
    <Text className="text-[11px] text-muted">
      Rating:{' '}
      <Text
        className={`font-bold ${
          isUp
            ? 'text-success'
            : 'text-danger'
        }`}
      >
        {isUp ? '+' : ''}
        {change}
      </Text>
    </Text>
  );
}

function TeamLine({ game }: { game: GameHistoryEntry }): React.ReactNode {
  const partners = game.partner_names.join(' / ');
  const opponents = game.opponent_names.join(' / ');
  const mySide = partners.length > 0 ? `You / ${partners}` : 'You';

  return (
    <Text className="text-[12px] text-muted leading-[1.5]">
      <Text className="font-bold text-default">
        You
      </Text>
      {partners.length > 0 ? ` / ${partners}` : ''}
      {` vs ${opponents}`}
    </Text>
  );
}

export default function GameRow({ game, onPress }: GameRowProps): React.ReactNode {
  const score = formatGameScore(game.my_score, game.opponent_score);
  const handlePress = useCallback(() => {
    void hapticMedium();
    onPress?.(game);
  }, [game, onPress]);

  return (
    <Pressable
      testID={`game-row-${game.id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Game result: ${game.result}, score: ${score}`}
      className="bg-surface rounded-[12px] px-[14px] py-[14px] shadow-sm dark:shadow-none dark:border border-divider mb-[10px] active:opacity-80"
    >
      {/* Top row: result badge */}
      <View className="flex-row justify-between items-center mb-2">
        <ResultBadge result={game.result} />
      </View>

      {/* Score */}
      <Text className="text-[20px] font-bold text-default mb-1">
        {score}
      </Text>

      {/* Teams */}
      <TeamLine game={game} />

      {/* Pending note — session not yet submitted */}
      {!game.session_submitted && (
        <Text className="text-[11px] text-warning mt-[3px]">
          Awaiting session submission
        </Text>
      )}

      {/* Meta row */}
      <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-divider">
        {game.league_name != null ? (
          <Text className="text-[11px] font-bold text-brand-teal">
            {game.league_name}
          </Text>
        ) : (
          <Text className="text-[11px] text-muted">
            Pickup
          </Text>
        )}
        <RatingChange change={game.rating_change} submitted={game.session_submitted} />
      </View>
    </Pressable>
  );
}
