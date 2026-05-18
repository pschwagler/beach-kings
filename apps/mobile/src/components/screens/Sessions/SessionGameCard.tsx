/**
 * SessionGameCard — renders a single game/match row within a session.
 *
 * Shows: game number, WIN/LOSS/PENDING badge (omitted when user is not a participant), team names, score, rating change.
 * Wireframe ref: session-active.html, session-detail.html
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { SessionGame } from '@beach-kings/shared';

interface Props {
  readonly game: SessionGame;
  /** player ids on the current user's team for badge determination */
  readonly userTeam?: 1 | 2 | null;
  readonly onEdit?: () => void;
}

type GameResult = 'win' | 'loss' | 'pending' | 'not-participant';

function getResult(game: SessionGame, userTeam: 1 | 2 | null): GameResult {
  if (userTeam == null) return 'not-participant';
  if (game.winner == null) return 'pending';
  return game.winner === userTeam ? 'win' : 'loss';
}

const RESULT_STYLES: Record<Exclude<GameResult, 'not-participant'>, { badge: string; text: string; label: string }> = {
  win: {
    badge: 'bg-success-tint',
    text: 'text-success',
    label: 'WIN',
  },
  loss: {
    badge: 'bg-danger-tint',
    text: 'text-danger',
    label: 'LOSS',
  },
  pending: {
    badge: 'bg-elevated',
    text: 'text-muted',
    label: 'PENDING',
  },
};

export default function SessionGameCard({
  game,
  userTeam = null,
  onEdit,
}: Props): React.ReactNode {
  const result = getResult(game, userTeam);
  const resultStyles = result !== 'not-participant' ? RESULT_STYLES[result] : null;

  const scoreText =
    game.team1_score != null && game.team2_score != null
      ? `${game.team1_score} - ${game.team2_score}`
      : null;

  const ratingText =
    game.rating_change != null
      ? game.rating_change > 0
        ? `+${game.rating_change.toFixed(1)}`
        : `${game.rating_change.toFixed(1)}`
      : null;

  return (
    <View
      testID={`session-game-card-${game.id}`}
      className="bg-surface rounded-[12px] p-[12px] mb-[8px] border border-divider"
    >
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-[8px]">
        <Text className="text-[12px] text-muted font-semibold">
          Game {game.game_number}
        </Text>
        <View className="flex-row items-center gap-[8px]">
          {resultStyles != null && (
            <View className={`px-[8px] py-[3px] rounded-[10px] ${resultStyles.badge}`}>
              <Text className={`text-[10px] font-bold ${resultStyles.text}`}>{resultStyles.label}</Text>
            </View>
          )}
          {onEdit != null && (
            <TouchableOpacity
              onPress={onEdit}
              testID={`session-game-edit-${game.id}`}
              className="p-[4px]"
            >
              <Text className="text-[12px] text-brand-teal">Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Matchup */}
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-[13px] font-semibold text-default" numberOfLines={1}>
            {game.team1_player1_name} / {game.team1_player2_name}
          </Text>
          <Text className="text-[12px] text-muted mt-[2px]">
            vs
          </Text>
          <Text className="text-[13px] font-semibold text-default" numberOfLines={1}>
            {game.team2_player1_name} / {game.team2_player2_name}
          </Text>
        </View>

        <View className="items-end">
          {scoreText != null && (
            <Text className="text-[15px] font-bold text-default">
              {scoreText}
            </Text>
          )}
          {ratingText != null ? (
            <Text
              className={`text-[12px] font-semibold mt-[2px] ${
                (game.rating_change ?? 0) > 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {ratingText}
            </Text>
          ) : result === 'pending' ? (
            <View className="bg-elevated px-[6px] py-[2px] rounded-[6px] mt-[4px]">
              <Text className="text-[10px] text-muted font-semibold">PENDING</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
