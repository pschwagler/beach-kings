import React from 'react';
import { Edit } from 'lucide-react';
import ShareInviteIcon from '../player/ShareInviteIcon';

interface MatchCardProps {
  match: any;
  onPlayerClick: (playerId: any, playerName: string, e: React.MouseEvent) => void;
  onEdit?: (match: any) => void;
  showEdit?: boolean;
}

/**
 * Builds the tooltip text for the Pending badge.
 * Names specific unregistered (placeholder) players when available.
 */
function buildPendingTooltip(match: any): string {
  const slots = [
    { name: match.team_1_player_1, isPlaceholder: match.team_1_player_1_is_placeholder },
    { name: match.team_1_player_2, isPlaceholder: match.team_1_player_2_is_placeholder },
    { name: match.team_2_player_1, isPlaceholder: match.team_2_player_1_is_placeholder },
    { name: match.team_2_player_2, isPlaceholder: match.team_2_player_2_is_placeholder },
  ];
  const names = slots
    .filter((s) => s.isPlaceholder && s.name)
    .map((s) => s.name as string);

  if (names.length > 0) {
    return `Waiting for ${names.join(', ')} to register to finalize this game`;
  }
  return 'Waiting for unregistered player(s) to join to finalize this game';
}

/**
 * MatchCard Component — individual match display.
 * Shows two teams with players, scores, and winner highlight.
 * Displays ShareInviteIcon next to placeholder player names.
 */
export default function MatchCard({ match, onPlayerClick, onEdit, showEdit = false }: MatchCardProps) {
  const team1Won = match.winner === 'Team 1';
  const team2Won = match.winner === 'Team 2';

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking on player name
    if ((e.target as HTMLElement).classList.contains('player-name')) {
      return;
    }
    if (showEdit && onEdit) {
      onEdit(match);
    }
  };

  return (
    <div
      className={`match-card ${showEdit ? 'editable' : ''}`}
      onClick={handleCardClick}
      data-testid="match-card"
    >
      {/* Edit icon for active session matches */}
      {showEdit && onEdit && (
        <div className="match-card-edit-icon">
          <Edit size={16} />
        </div>
      )}

      {/* Team 1 */}
      <div className={`match-team ${team1Won ? 'winner' : 'loser'}`}>
        <div className="team-players">
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match.team_1_player_1_id, match.team_1_player_1, e); }}>
            {match.team_1_player_1}
            {match.team_1_player_1_is_placeholder && <ShareInviteIcon playerId={match.team_1_player_1_id} playerName={match.team_1_player_1} />}
          </span>
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match.team_1_player_2_id, match.team_1_player_2, e); }}>
            {match.team_1_player_2}
            {match.team_1_player_2_is_placeholder && <ShareInviteIcon playerId={match.team_1_player_2_id} playerName={match.team_1_player_2} />}
          </span>
        </div>
        <div className={`team-score ${team1Won ? 'winner-score' : 'loser-score'}`}>
          {match.team_1_score}
        </div>
      </div>

      {/* Team 2 */}
      <div className={`match-team ${team2Won ? 'winner' : 'loser'}`}>
        <div className="team-players">
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match.team_2_player_1_id, match.team_2_player_1, e); }}>
            {match.team_2_player_1}
            {match.team_2_player_1_is_placeholder && <ShareInviteIcon playerId={match.team_2_player_1_id} playerName={match.team_2_player_1} />}
          </span>
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match.team_2_player_2_id, match.team_2_player_2, e); }}>
            {match.team_2_player_2}
            {match.team_2_player_2_is_placeholder && <ShareInviteIcon playerId={match.team_2_player_2_id} playerName={match.team_2_player_2} />}
          </span>
        </div>
        <div className={`team-score ${team2Won ? 'winner-score' : 'loser-score'}`}>
          {match.team_2_score}
        </div>
      </div>

      {/* Ranked/Unranked/Pending badge strip below teams */}
      <div className="match-card-ranked-strip">
        {match.is_ranked ? (
          <span className="match-card-badge match-card-badge--ranked">Ranked</span>
        ) : match.ranked_intent ? (
          <span
            className="match-card-badge match-card-badge--pending"
            data-tooltip={buildPendingTooltip(match)}
            aria-label={buildPendingTooltip(match)}
          >
            Pending
          </span>
        ) : (
          <span className="match-card-badge match-card-badge--unranked">Unranked</span>
        )}
      </div>
    </div>
  );
}
