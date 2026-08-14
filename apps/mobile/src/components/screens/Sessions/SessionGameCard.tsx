/**
 * SessionGameCard — renders a single game/match row within a session.
 *
 * Shows: game number, WIN/LOSS badge (omitted when user is not a participant),
 * boxscore rows (winner row highlighted), and rating change.
 * Wireframe ref: session-active.html, session-detail.html
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, TouchableOpacity } from 'react-native';
import type { SessionGame } from '@beach-kings/shared';

interface Props {
  readonly game: SessionGame;
  readonly userTeam?: 1 | 2 | null;
  readonly onEdit?: () => void;
  /** When provided, replaces the matching player's name with "You". Case-insensitive. */
  readonly currentPlayerName?: string | null;
}

type GameResult = 'win' | 'loss' | 'pending' | 'not-participant';

function getResult(game: SessionGame, userTeam: 1 | 2 | null): GameResult {
  if (userTeam == null) return 'not-participant';
  if (game.winner == null) return 'pending';
  return game.winner === userTeam ? 'win' : 'loss';
}

const RESULT_BADGE: Record<Exclude<GameResult, 'not-participant' | 'pending'>, { badge: string; text: string; label: string }> = {
  win: { badge: 'bg-success-tint', text: 'text-success', label: 'WIN' },
  loss: { badge: 'bg-danger-tint', text: 'text-danger', label: 'LOSS' },
};

interface TeamRowProps {
  readonly name: string;
  readonly score: number | null;
  readonly isWinner: boolean;
  readonly isLoser: boolean;
}

function substituteYou(name: string, currentPlayerName: string | null): string {
  if (currentPlayerName == null) return name;
  return name.trim().toLowerCase() === currentPlayerName.trim().toLowerCase() ? 'You' : name;
}

function TeamRow({ name, score, isWinner, isLoser }: TeamRowProps): React.ReactNode {
  return (
    <View
      className={`flex-row items-center justify-between px-[10px] py-[7px] rounded-[8px] ${
        isWinner ? 'bg-success-tint' : ''
      }`}
    >
      <AppText
        className={`flex-1 text-[13px] font-semibold pr-[8px] ${
          isLoser ? 'text-muted' : 'text-default'
        }`}
        numberOfLines={1}
      >
        {name}
      </AppText>
      <AppText
        className={`text-[18px] font-bold ${
          isWinner ? 'text-success' : 'text-muted'
        }`}
      >
        {score != null ? String(score) : '—'}
      </AppText>
    </View>
  );
}

export default function SessionGameCard({
  game,
  userTeam = null,
  onEdit,
  currentPlayerName = null,
}: Props): React.ReactNode {
  const result = getResult(game, userTeam);
  const badgeStyles = result === 'win' || result === 'loss' ? RESULT_BADGE[result] : null;

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
        <AppText className="text-[12px] text-muted font-semibold">
          Game {game.game_number}
        </AppText>
        <View className="flex-row items-center gap-[8px]">
          {badgeStyles != null && (
            <View className={`px-[8px] py-[3px] rounded-[10px] ${badgeStyles.badge}`}>
              <AppText className={`text-[10px] font-bold ${badgeStyles.text}`}>{badgeStyles.label}</AppText>
            </View>
          )}
          {onEdit != null && (
            <TouchableOpacity
              onPress={onEdit}
              testID={`session-game-edit-${game.id}`}
              className="p-[4px]"
            >
              <AppText className="text-[12px] text-brand-teal">Edit</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Boxscore rows */}
      <View className="gap-[3px]">
        <TeamRow
          name={`${substituteYou(game.team1_player1_name, currentPlayerName)} / ${substituteYou(game.team1_player2_name, currentPlayerName)}`}
          score={game.team1_score}
          isWinner={game.winner === 1}
          isLoser={game.winner === 2}
        />
        <TeamRow
          name={`${substituteYou(game.team2_player1_name, currentPlayerName)} / ${substituteYou(game.team2_player2_name, currentPlayerName)}`}
          score={game.team2_score}
          isWinner={game.winner === 2}
          isLoser={game.winner === 1}
        />
      </View>

      {ratingText != null && (
        <AppText
          className={`text-[12px] font-semibold mt-[6px] text-right ${
            (game.rating_change ?? 0) > 0 ? 'text-success' : 'text-danger'
          }`}
        >
          {ratingText}
        </AppText>
      )}
    </View>
  );
}
