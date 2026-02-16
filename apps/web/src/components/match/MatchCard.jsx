import { Edit } from 'lucide-react';
import PlaceholderBadge from '../player/PlaceholderBadge';

/**
 * MatchCard Component — individual match display.
 * Shows two teams with players, scores, and winner highlight.
 * Displays PlaceholderBadge next to placeholder player names.
 */
export default function MatchCard({ match, onPlayerClick, onEdit, showEdit = false }) {
  const team1Won = match.Winner === 'Team 1';
  const team2Won = match.Winner === 'Team 2';

  const handleCardClick = (e) => {
    // Don't trigger card click if clicking on player name
    if (e.target.classList.contains('player-name')) {
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
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match['Team 1 Player 1']); }}>
            {match['Team 1 Player 1']}
            {match['Team 1 Player 1 IsPlaceholder'] && <PlaceholderBadge />}
          </span>
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match['Team 1 Player 2']); }}>
            {match['Team 1 Player 2']}
            {match['Team 1 Player 2 IsPlaceholder'] && <PlaceholderBadge />}
          </span>
        </div>
        <div className={`team-score ${team1Won ? 'winner-score' : 'loser-score'}`}>
          {match['Team 1 Score']}
        </div>
      </div>

      {/* Team 2 */}
      <div className={`match-team ${team2Won ? 'winner' : 'loser'}`}>
        <div className="team-players">
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match['Team 2 Player 1']); }}>
            {match['Team 2 Player 1']}
            {match['Team 2 Player 1 IsPlaceholder'] && <PlaceholderBadge />}
          </span>
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match['Team 2 Player 2']); }}>
            {match['Team 2 Player 2']}
            {match['Team 2 Player 2 IsPlaceholder'] && <PlaceholderBadge />}
          </span>
        </div>
        <div className={`team-score ${team2Won ? 'winner-score' : 'loser-score'}`}>
          {match['Team 2 Score']}
        </div>
      </div>

      {/* Ranked/Unranked badge strip below teams */}
      <div className="match-card-ranked-strip">
        {match['Is Ranked'] === false ? (
          <span className="match-card-badge match-card-badge--unranked">Unranked</span>
        ) : (
          <span className="match-card-badge match-card-badge--ranked">Ranked</span>
        )}
      </div>
    </div>
  );
}
