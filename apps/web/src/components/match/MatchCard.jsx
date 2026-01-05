import { Edit } from 'lucide-react';

// MatchCard Component - individual match display
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
          </span>
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match['Team 1 Player 2']); }}>
            {match['Team 1 Player 2']}
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
          </span>
          <span className="player-name-modern" onClick={(e) => { e.stopPropagation(); onPlayerClick(match['Team 2 Player 2']); }}>
            {match['Team 2 Player 2']}
          </span>
        </div>
        <div className={`team-score ${team2Won ? 'winner-score' : 'loser-score'}`}>
          {match['Team 2 Score']}
        </div>
      </div>
    </div>
  );
}


