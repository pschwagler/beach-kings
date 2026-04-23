/**
 * SessionGameCard — renders a single game/match row within a session.
 *
 * Shows: game number, WIN/LOSS/PENDING badge, team names, score, rating change.
 * Wireframe ref: session-active.html, session-detail.html
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { SessionGame } from '@/lib/mockApi';

interface Props {
  readonly game: SessionGame;
  /** player ids on the current user's team for badge determination */
  readonly userTeam?: 1 | 2 | null;
  readonly onEdit?: () => void;
}

type GameResult = 'win' | 'loss' | 'pending';

function getResult(game: SessionGame, userTeam: 1 | 2 | null): GameResult {
  if (game.winner == null) return 'pending';
  if (userTeam == null) return 'pending';
  return game.winner === userTeam ? 'win' : 'loss';
}

const RESULT_STYLES: Record<GameResult, { badge: string; text: string; label: string }> = {
  win: {
    badge: 'bg-[#dcfce7]',
    text: 'text-[#15803d]',
    label: 'WIN',
  },
  loss: {
    badge: 'bg-[#fee2e2]',
    text: 'text-[#dc2626]',
    label: 'LOSS',
  },
  pending: {
    badge: 'bg-[#f5f5f5] dark:bg-[#2a2a2a]',
    text: 'text-text-secondary dark:text-content-secondary',
    label: 'PENDING',
  },
};

export default function SessionGameCard({
  game,
  userTeam = null,
  onEdit,
}: Props): React.ReactNode {
  const result = getResult(game, userTeam);
  const { badge, text, label } = RESULT_STYLES[result];

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
      className="bg-white dark:bg-[#1a1a1a] rounded-[12px] p-[12px] mb-[8px] border border-[#eee] dark:border-[#2a2a2a]"
    >
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-[8px]">
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary font-semibold">
          Game {game.game_number}
        </Text>
        <View className="flex-row items-center gap-[8px]">
          <View className={`px-[8px] py-[3px] rounded-[10px] ${badge}`}>
            <Text className={`text-[10px] font-bold ${text}`}>{label}</Text>
          </View>
          {onEdit != null && (
            <TouchableOpacity
              onPress={onEdit}
              testID={`session-game-edit-${game.id}`}
              className="p-[4px]"
            >
              <Text className="text-[12px] text-[#2a7d9c]">Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Matchup */}
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-[13px] font-semibold text-text-default dark:text-content-primary" numberOfLines={1}>
            {game.team1_player1_name} / {game.team1_player2_name}
          </Text>
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]">
            vs
          </Text>
          <Text className="text-[13px] font-semibold text-text-default dark:text-content-primary" numberOfLines={1}>
            {game.team2_player1_name} / {game.team2_player2_name}
          </Text>
        </View>

        <View className="items-end">
          {scoreText != null && (
            <Text className="text-[15px] font-bold text-text-default dark:text-content-primary">
              {scoreText}
            </Text>
          )}
          {ratingText != null ? (
            <Text
              className={`text-[12px] font-semibold mt-[2px] ${
                (game.rating_change ?? 0) > 0 ? 'text-[#15803d]' : 'text-[#dc2626]'
              }`}
            >
              {ratingText}
            </Text>
          ) : result === 'pending' ? (
            <View className="bg-[#f5f5f5] dark:bg-[#2a2a2a] px-[6px] py-[2px] rounded-[6px] mt-[4px]">
              <Text className="text-[10px] text-text-secondary dark:text-content-secondary font-semibold">
                PENDING
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
