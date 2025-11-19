import { Plus, Save, Trophy, Users } from 'lucide-react';
import MatchCard from '../match/MatchCard';
import SessionHeader from './SessionHeader';
import SessionActions from './SessionActions';

// Helper function to get unique players from matches
function getUniquePlayersCount(matches) {
  const players = new Set();
  matches.forEach(match => {
    if (match['Team 1 Player 1']) players.add(match['Team 1 Player 1']);
    if (match['Team 1 Player 2']) players.add(match['Team 1 Player 2']);
    if (match['Team 2 Player 1']) players.add(match['Team 2 Player 1']);
    if (match['Team 2 Player 2']) players.add(match['Team 2 Player 2']);
  });
  return players.size;
}

export default function ActiveSessionPanel({ 
  activeSession, 
  activeSessionMatches, 
  onPlayerClick,
  onAddMatchClick,
  onEditMatch,
  onSubmitClick,
  onSaveClick,
  onCancelClick,
  onDeleteSession,
  isEditing = false
}) {
  const gameCount = activeSessionMatches.length;
  const playerCount = getUniquePlayersCount(activeSessionMatches);

  const handleDeleteSession = () => {
    if (onDeleteSession) {
      onDeleteSession(activeSession.id);
    }
  };

  return (
    <div className="active-session-panel">
      <SessionHeader 
        sessionName={activeSession.name}
        gameCount={gameCount}
        playerCount={playerCount}
        onDelete={gameCount === 0 ? handleDeleteSession : null}
        isEditing={isEditing}
      />

      <SessionActions 
        onAddMatchClick={onAddMatchClick}
        onSubmitClick={onSubmitClick}
        onSaveClick={onSaveClick}
        onCancelClick={onCancelClick}
        isEditing={isEditing}
      />

      <div className="session-matches-section">
        <div className="session-matches-label">
          Session Matches
        </div>
        {activeSessionMatches.length === 0 ? (
          <div className="session-empty-state">
            <Trophy size={40} className="session-empty-icon" />
            <div className="session-empty-text">
              No matches recorded. Start by adding your first match!
            </div>
          </div>
        ) : (
          <div className="match-cards">
            {activeSessionMatches.map((match, idx) => (
              <MatchCard
                key={idx}
                match={match}
                onPlayerClick={onPlayerClick}
                onEdit={onEditMatch}
                showEdit={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


